data "aws_caller_identity" "current" {}

locals {
  msk_cluster_arn_parts  = split(":", var.msk_cluster_arn)
  msk_cluster_path       = local.msk_cluster_arn_parts[5]
  msk_cluster_path_parts = split("/", local.msk_cluster_path)
  msk_cluster_name       = local.msk_cluster_path_parts[1]
  msk_cluster_uuid       = local.msk_cluster_path_parts[2]

  msk_topic_arn        = "arn:aws:kafka:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topic/${local.msk_cluster_name}/${local.msk_cluster_uuid}/${var.topic_name}"
  msk_group_arn        = "arn:aws:kafka:${var.aws_region}:${data.aws_caller_identity.current.account_id}:group/${local.msk_cluster_name}/${local.msk_cluster_uuid}/centrifugo-flags"
  msk_bridge_group_arn = "arn:aws:kafka:${var.aws_region}:${data.aws_caller_identity.current.account_id}:group/${local.msk_cluster_name}/${local.msk_cluster_uuid}/centrifugo-flags-bridge"

  bridge_start_command = <<-EOC
    set -e
    mkdir -p /tmp/bridge
    cd /tmp/bridge
    npm init -y >/dev/null 2>&1
    npm install kafkajs aws-msk-iam-sasl-signer-js >/dev/null 2>&1
    cat > bridge.js <<'EOF'
    const { Kafka, logLevel } = require("kafkajs");
    const { generateAuthToken } = require("aws-msk-iam-sasl-signer-js");

    const region = process.env.AWS_REGION;
    const brokers = (process.env.MSK_BOOTSTRAP_BROKERS_IAM || "").split(",").filter(Boolean);
    const topic = process.env.MSK_TOPIC || "feature-flag-changes";
    const groupId = process.env.MSK_CONSUMER_GROUP || "centrifugo-flags-bridge";
    const centrifugoUrl = process.env.CENTRIFUGO_INTERNAL_URL || "http://127.0.0.1:8000";
    const centrifugoApiKey = process.env.CENTRIFUGO_HTTP_API_KEY;

    if (!region || !brokers.length || !centrifugoApiKey) {
      throw new Error("Missing required bridge environment variables.");
    }

    const oauthBearerProvider = async () => {
      const authTokenResponse = await generateAuthToken({ region });
      return { value: authTokenResponse.token };
    };

    const kafka = new Kafka({
      clientId: "centrifugo-msk-bridge",
      brokers,
      ssl: true,
      sasl: {
        mechanism: "oauthbearer",
        oauthBearerProvider,
      },
      logLevel: logLevel.INFO,
    });

    const consumer = kafka.consumer({ groupId });

    const parseMessage = (message) => {
      if (!message || !message.value) return null;
      try {
        return JSON.parse(message.value.toString("utf8"));
      } catch {
        return null;
      }
    };

    const normalizeHeaderValue = (value) => {
      if (!value) return "";
      return Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
    };

    const parseChannelList = (value) => {
      return normalizeHeaderValue(value)
        .split(",")
        .map((channel) => channel.trim())
        .filter(Boolean);
    };

    const resolveChannels = (message, payload) => {
      const headers = message && message.headers ? message.headers : {};
      const scoped = parseChannelList(headers["x-centrifugo-channels"]);
      const channels = Array.from(new Set([...scoped]));
      if (channels.length > 0) {
        return channels;
      }

      if (payload && payload.accountId && payload.appId) {
        return ["flags:acc:" + payload.accountId + ":app:" + payload.appId];
      }

      return [];
    };

    const publishToCentrifugo = async ({ channel, data }) => {
      const response = await fetch(centrifugoUrl + "/api/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": centrifugoApiKey,
        },
        body: JSON.stringify({ channel, data }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error("Centrifugo publish failed (" + response.status + "): " + body);
      }
    };

    const run = async () => {
      console.log("Starting MSK to Centrifugo bridge");
      await consumer.connect();
      await consumer.subscribe({ topic, fromBeginning: false });
      await consumer.run({
        eachMessage: async ({ message }) => {
          const payload = parseMessage(message);
          if (!payload) return;

          const channels = resolveChannels(message, payload);
          if (!channels.length) return;

          for (const channel of channels) {
            await publishToCentrifugo({ channel, data: payload });
            console.log("Published message to", channel);
          }
        },
      });
    };

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const main = async () => {
      while (true) {
        try {
          await run();
          return;
        } catch (error) {
          console.error("MSK bridge failed:", error);
          await sleep(5000);
        }
      }
    };

    main();
    EOF
    node bridge.js
  EOC

  centrifugo_hostname        = trimspace(var.centrifugo_domain_name) != "" ? trimspace(var.centrifugo_domain_name) : aws_lb.centrifugo.dns_name
  centrifugo_public_base_url = "https://${local.centrifugo_hostname}"
  centrifugo_websocket_url   = "wss://${local.centrifugo_hostname}/connection/websocket"
  centrifugo_public_origin   = "https://${local.centrifugo_hostname}"
  centrifugo_allowed_origins = distinct(concat(var.centrifugo_client_allowed_origins, [local.centrifugo_public_origin]))
}

resource "aws_route53_record" "centrifugo_a_alias" {
  count = trimspace(var.centrifugo_domain_name) != "" && trimspace(var.centrifugo_route53_zone_id) != "" ? 1 : 0

  zone_id = trimspace(var.centrifugo_route53_zone_id)
  name    = trimspace(var.centrifugo_domain_name)
  type    = "A"

  alias {
    name                   = aws_lb.centrifugo.dns_name
    zone_id                = aws_lb.centrifugo.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "centrifugo_aaaa_alias" {
  count = trimspace(var.centrifugo_domain_name) != "" && trimspace(var.centrifugo_route53_zone_id) != "" ? 1 : 0

  zone_id = trimspace(var.centrifugo_route53_zone_id)
  name    = trimspace(var.centrifugo_domain_name)
  type    = "AAAA"

  alias {
    name                   = aws_lb.centrifugo.dns_name
    zone_id                = aws_lb.centrifugo.zone_id
    evaluate_target_health = true
  }
}

resource "random_password" "hmac" {
  length  = 48
  special = false
}

resource "aws_security_group" "centrifugo" {
  name        = "centrifugo-sg"
  description = "Security group for Centrifugo"
  vpc_id      = var.vpc_id

  egress {
    description = "Outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "centrifugo-sg"
  }
}

resource "aws_security_group" "centrifugo_alb" {
  name        = "centrifugo-alb-sg"
  description = "Security group for Centrifugo ALB"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.my_ip_cidr]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.my_ip_cidr]
  }

  egress {
    description = "Outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "centrifugo-alb-sg"
  }
}

resource "aws_security_group_rule" "allow_alb_to_centrifugo" {
  type                     = "ingress"
  from_port                = 8000
  to_port                  = 8000
  protocol                 = "tcp"
  security_group_id        = aws_security_group.centrifugo.id
  source_security_group_id = aws_security_group.centrifugo_alb.id
  description              = "Allow ALB to reach Centrifugo container"
}

resource "aws_security_group_rule" "allow_centrifugo_to_msk" {
  type                     = "ingress"
  from_port                = 9098
  to_port                  = 9098
  protocol                 = "tcp"
  security_group_id        = var.msk_security_group_id
  source_security_group_id = aws_security_group.centrifugo.id
  description              = "Allow Centrifugo to reach MSK IAM listener"
}

resource "aws_lb" "centrifugo" {
  name               = "centrifugo-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.centrifugo_alb.id]
  subnets            = var.public_subnet_ids
  idle_timeout       = 300

  lifecycle {
    precondition {
      condition     = trimspace(var.centrifugo_alb_certificate_arn) != ""
      error_message = "centrifugo_alb_certificate_arn is required; public Centrifugo deployment must use HTTPS/TLS."
    }
  }

  tags = {
    Name = "centrifugo-alb"
  }
}

resource "aws_lb_target_group" "centrifugo" {
  name        = "centrifugo-tg"
  port        = 8000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  health_check {
    enabled             = true
    path                = "/health"
    matcher             = "200-399"
    protocol            = "HTTP"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "centrifugo_http_redirect" {
  count = 1

  load_balancer_arn = aws_lb.centrifugo.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "centrifugo_https" {
  count = 1

  load_balancer_arn = aws_lb.centrifugo.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.centrifugo_alb_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.centrifugo.arn
  }
}

resource "aws_iam_role" "centrifugo_execution" {
  name = "centrifugo-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "centrifugo_execution_ecr_logs" {
  role       = aws_iam_role.centrifugo_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "centrifugo_task" {
  name = "centrifugo-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role" "centrifugo_msk_consumer" {
  name = "centrifugo-msk-consumer-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.centrifugo_task.arn
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "centrifugo_task_assume_msk" {
  name = "centrifugo-task-assume-msk"
  role = aws_iam_role.centrifugo_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sts:AssumeRole"
        ]
        Resource = aws_iam_role.centrifugo_msk_consumer.arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "centrifugo_task_msk_read" {
  name = "centrifugo-task-msk-read"
  role = aws_iam_role.centrifugo_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kafka-cluster:Connect",
          "kafka-cluster:DescribeCluster"
        ]
        Resource = var.msk_cluster_arn
      },
      {
        Effect = "Allow"
        Action = [
          "kafka-cluster:DescribeTopic",
          "kafka-cluster:ReadData"
        ]
        Resource = local.msk_topic_arn
      },
      {
        Effect = "Allow"
        Action = [
          "kafka-cluster:DescribeGroup",
          "kafka-cluster:AlterGroup"
        ]
        Resource = local.msk_bridge_group_arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "centrifugo_msk_consumer_access" {
  name = "centrifugo-msk-consumer-access"
  role = aws_iam_role.centrifugo_msk_consumer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kafka-cluster:Connect",
          "kafka-cluster:DescribeCluster"
        ]
        Resource = var.msk_cluster_arn
      },
      {
        Effect = "Allow"
        Action = [
          "kafka-cluster:DescribeTopic",
          "kafka-cluster:ReadData"
        ]
        Resource = local.msk_topic_arn
      },
      {
        Effect = "Allow"
        Action = [
          "kafka-cluster:DescribeGroup",
          "kafka-cluster:AlterGroup"
        ]
        Resource = local.msk_group_arn
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "centrifugo" {
  name              = "/ecs/centrifugo"
  retention_in_days = 7
}

resource "aws_ecs_cluster" "centrifugo" {
  name = "centrifugo"
}

resource "aws_ecs_task_definition" "centrifugo" {
  family                   = "centrifugo"
  cpu                      = "256"
  memory                   = "512"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = aws_iam_role.centrifugo_execution.arn
  task_role_arn            = aws_iam_role.centrifugo_task.arn

  container_definitions = jsonencode([
    {
      name      = "centrifugo"
      image     = var.centrifugo_image
      essential = true
      command   = ["centrifugo"]

      portMappings = [
        {
          containerPort = 8000
          hostPort      = 8000
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "CENTRIFUGO_CLIENT_TOKEN_RSA_PUBLIC_KEY"
          value = var.consumer_jwt_public_key
        },
        {
          name  = "CENTRIFUGO_CLIENT_TOKEN_ISSUER"
          value = var.consumer_jwt_issuer
        },
        {
          name  = "CENTRIFUGO_CLIENT_TOKEN_AUDIENCE"
          value = var.consumer_jwt_audience
        },
        {
          name  = "AWS_REGION"
          value = var.aws_region
        },
        {
          name  = "CENTRIFUGO_UNI_SSE_ENABLED"
          value = "true"
        },
        {
          name  = "CENTRIFUGO_HEALTH_ENABLED"
          value = "true"
        },
        {
          name  = "CENTRIFUGO_CLIENT_ALLOWED_ORIGINS"
          value = join(" ", local.centrifugo_allowed_origins)
        },
        {
          name  = "CENTRIFUGO_LOG_LEVEL"
          value = var.centrifugo_log_level
        },
        {
          name  = "CENTRIFUGO_HTTP_API_KEY"
          value = random_password.hmac.result
        },
        {
          name = "CENTRIFUGO_CHANNEL_NAMESPACES"
          value = jsonencode([
            {
              name                       = "flags"
              allow_subscribe_for_client = false
            }
          ])
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.centrifugo.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "centrifugo"
        }
      }
    },
    {
      name      = "msk-centrifugo-bridge"
      image     = "public.ecr.aws/docker/library/node:20-alpine"
      essential = true
      command = [
        "sh",
        "-lc",
        local.bridge_start_command
      ]

      environment = [
        {
          name  = "AWS_REGION"
          value = var.aws_region
        },
        {
          name  = "MSK_BOOTSTRAP_BROKERS_IAM"
          value = var.msk_bootstrap_brokers_iam
        },
        {
          name  = "MSK_TOPIC"
          value = var.topic_name
        },
        {
          name  = "MSK_CONSUMER_GROUP"
          value = "centrifugo-flags-bridge"
        },
        {
          name  = "CENTRIFUGO_INTERNAL_URL"
          value = "http://127.0.0.1:8000"
        },
        {
          name  = "CENTRIFUGO_HTTP_API_KEY"
          value = random_password.hmac.result
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.centrifugo.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "bridge"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "centrifugo" {
  name            = "centrifugo"
  cluster         = aws_ecs_cluster.centrifugo.id
  task_definition = aws_ecs_task_definition.centrifugo.arn
  desired_count   = var.centrifugo_desired_count
  launch_type     = "FARGATE"

  deployment_minimum_healthy_percent = var.centrifugo_deployment_minimum_healthy_percent
  deployment_maximum_percent         = var.centrifugo_deployment_maximum_percent

  load_balancer {
    target_group_arn = aws_lb_target_group.centrifugo.arn
    container_name   = "centrifugo"
    container_port   = 8000
  }

  network_configuration {
    subnets          = var.public_subnet_ids
    security_groups  = [aws_security_group.centrifugo.id]
    assign_public_ip = true
  }

  depends_on = [
    aws_lb_listener.centrifugo_http_redirect,
    aws_lb_listener.centrifugo_https,
    aws_security_group_rule.allow_alb_to_centrifugo,
    aws_security_group_rule.allow_centrifugo_to_msk,
    aws_iam_role_policy.centrifugo_task_assume_msk,
    aws_iam_role_policy.centrifugo_msk_consumer_access,
    aws_iam_role_policy.centrifugo_task_msk_read
  ]
}

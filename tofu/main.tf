locals {
  table_name               = var.feature_flags_table_name != "" ? var.feature_flags_table_name : "${var.project_name}-${var.environment}-flags-tenant"
  applications_table_name  = var.applications_table_name != "" ? var.applications_table_name : "${var.project_name}-${var.environment}-app-data"
  authorizer_name          = "${var.project_name}-${var.environment}-gateway-authorizer"
  api_name                 = "${var.project_name}-${var.environment}-api"
  authorizer_zipfile       = "${path.module}/gateway-authorizer.zip"
  create_flag_name         = "${var.project_name}-${var.environment}-create-flag"
  create_flag_zipfile      = "${path.module}/create-flag.zip"
  list_flags_name          = "${var.project_name}-${var.environment}-list-flags"
  list_flags_zipfile       = "${path.module}/list-flags.zip"
  delete_flag_name         = "${var.project_name}-${var.environment}-delete-flag"
  delete_flag_zipfile      = "${path.module}/delete-flag.zip"
  consumer_auth_name       = "${var.project_name}-${var.environment}-consumer-auth"
  consumer_auth_zipfile    = "${path.module}/consumer-auth.zip"
  stream_publisher_name    = "${var.project_name}-${var.environment}-stream-publisher"
  stream_publisher_zipfile = "${path.module}/stream-publisher.zip"
}

data "archive_file" "gateway_authorizer" {
  type        = "zip"
  source_dir  = "${path.module}/../functions/gateway-authorizer"
  output_path = local.authorizer_zipfile
}

data "archive_file" "create_flag" {
  type        = "zip"
  source_dir  = "${path.module}/../functions/api/createFlag"
  output_path = local.create_flag_zipfile
}

data "archive_file" "list_flags" {
  type        = "zip"
  source_dir  = "${path.module}/../functions/api/listFlags"
  output_path = local.list_flags_zipfile
}

data "archive_file" "delete_flag" {
  type        = "zip"
  source_dir  = "${path.module}/../functions/api/deleteFlag"
  output_path = local.delete_flag_zipfile
}

data "archive_file" "consumer_auth" {
  type        = "zip"
  source_dir  = "${path.module}/../functions/api/consumerAuth"
  output_path = local.consumer_auth_zipfile
}

data "archive_file" "stream_publisher" {
  type        = "zip"
  source_dir  = "${path.module}/../functions/stream-publisher"
  output_path = local.stream_publisher_zipfile
}

resource "aws_iam_role" "gateway_authorizer" {
  name = "${local.authorizer_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "gateway_authorizer_basic" {
  role       = aws_iam_role.gateway_authorizer.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "gateway_authorizer" {
  function_name    = local.authorizer_name
  role             = aws_iam_role.gateway_authorizer.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.gateway_authorizer.output_path
  source_code_hash = data.archive_file.gateway_authorizer.output_base64sha256
  timeout          = 10

  environment {
    variables = {
      COGNITO_REGION          = var.cognito_region
      COGNITO_USER_POOL_ID    = var.cognito_user_pool_id
      REQUIRED_SCOPES         = var.required_scopes
      CONSUMER_JWT_ISSUER     = var.jwt_issuer
      CONSUMER_JWT_AUDIENCE   = var.jwt_audience
      CONSUMER_JWT_PUBLIC_KEY = var.jwt_public_key
    }
  }
}

resource "aws_api_gateway_rest_api" "feature_flags" {
  name = local.api_name
}

resource "aws_api_gateway_authorizer" "gateway_authorizer" {
  name                             = "${local.api_name}-authorizer"
  rest_api_id                      = aws_api_gateway_rest_api.feature_flags.id
  authorizer_uri                   = aws_lambda_function.gateway_authorizer.invoke_arn
  authorizer_result_ttl_in_seconds = 300
  identity_source                  = "method.request.header.Authorization"
  type                             = "REQUEST"
}

resource "aws_lambda_permission" "allow_apigw_authorizer" {
  statement_id  = "AllowAPIGatewayInvokeAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.gateway_authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.feature_flags.execution_arn}/authorizers/*"
}

resource "aws_dynamodb_table" "feature_flags" {
  name             = local.table_name
  billing_mode     = "PAY_PER_REQUEST"
  hash_key         = "pk"
  range_key        = "sk"
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  point_in_time_recovery {
    enabled = true
  }

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_dynamodb_table" "applications" {
  name         = local.applications_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "clientId"

  point_in_time_recovery {
    enabled = true
  }

  attribute {
    name = "clientId"
    type = "S"
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_iam_role" "create_flag" {
  name = "${local.create_flag_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role" "list_flags" {
  name = "${local.list_flags_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role" "delete_flag" {
  name = "${local.delete_flag_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "create_flag_basic" {
  role       = aws_iam_role.create_flag.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "list_flags_basic" {
  role       = aws_iam_role.list_flags.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "delete_flag_basic" {
  role       = aws_iam_role.delete_flag.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "create_flag_dynamodb" {
  name = "${local.create_flag_name}-dynamodb"
  role = aws_iam_role.create_flag.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.feature_flags.arn
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "list_flags_dynamodb" {
  name = "${local.list_flags_name}-dynamodb"
  role = aws_iam_role.list_flags.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Query"
        ]
        Resource = [
          aws_dynamodb_table.feature_flags.arn
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "delete_flag_dynamodb" {
  name = "${local.delete_flag_name}-dynamodb"
  role = aws_iam_role.delete_flag.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:DeleteItem"
        ]
        Resource = [
          aws_dynamodb_table.feature_flags.arn
        ]
      }
    ]
  })
}

resource "aws_lambda_function" "create_flag" {
  function_name    = local.create_flag_name
  role             = aws_iam_role.create_flag.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.create_flag.output_path
  source_code_hash = data.archive_file.create_flag.output_base64sha256
  timeout          = 10

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.feature_flags.name
    }
  }
}

resource "aws_lambda_function" "list_flags" {
  function_name    = local.list_flags_name
  role             = aws_iam_role.list_flags.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.list_flags.output_path
  source_code_hash = data.archive_file.list_flags.output_base64sha256
  timeout          = 10

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.feature_flags.name
    }
  }
}

resource "aws_lambda_function" "delete_flag" {
  function_name    = local.delete_flag_name
  role             = aws_iam_role.delete_flag.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.delete_flag.output_path
  source_code_hash = data.archive_file.delete_flag.output_base64sha256
  timeout          = 10

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.feature_flags.name
    }
  }
}

resource "aws_iam_role" "consumer_auth" {
  name = "${local.consumer_auth_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "consumer_auth_basic" {
  role       = aws_iam_role.consumer_auth.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "consumer_auth_dynamodb" {
  name = "${local.consumer_auth_name}-dynamodb"
  role = aws_iam_role.consumer_auth.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem"
        ]
        Resource = [
          aws_dynamodb_table.applications.arn
        ]
      }
    ]
  })
}

resource "aws_lambda_function" "consumer_auth" {
  function_name    = local.consumer_auth_name
  role             = aws_iam_role.consumer_auth.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.consumer_auth.output_path
  source_code_hash = data.archive_file.consumer_auth.output_base64sha256
  timeout          = 10

  environment {
    variables = {
      APPLICATIONS_TABLE_NAME = aws_dynamodb_table.applications.name
      JWT_ISSUER              = var.jwt_issuer
      JWT_AUDIENCE            = var.jwt_audience
      JWT_EXPIRES_IN_SECONDS  = tostring(var.jwt_expires_in_seconds)
      JWT_PRIVATE_KEY         = var.jwt_private_key
      JWT_KEY_ID              = "consumer-auth-rs256"
      DEFAULT_ENVIRONMENT     = var.environment
      APP_DATA_TABLE_NAME     = aws_dynamodb_table.applications.name
      ONBOARDING_API_KEY      = var.onboarding_api_key
    }
  }
}

resource "aws_lambda_permission" "allow_apigw_create_flag" {
  statement_id  = "AllowAPIGatewayInvokeCreateFlag"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.create_flag.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.feature_flags.execution_arn}/*/*"
}

resource "aws_lambda_permission" "allow_apigw_list_flags" {
  statement_id  = "AllowAPIGatewayInvokeListFlags"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.list_flags.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.feature_flags.execution_arn}/*/*"
}

resource "aws_lambda_permission" "allow_apigw_delete_flag" {
  statement_id  = "AllowAPIGatewayInvokeDeleteFlag"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.delete_flag.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.feature_flags.execution_arn}/*/*"
}

resource "aws_lambda_permission" "allow_apigw_consumer_auth" {
  statement_id  = "AllowAPIGatewayInvokeConsumerAuth"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.consumer_auth.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.feature_flags.execution_arn}/*/*"
}

resource "aws_api_gateway_resource" "flags" {
  rest_api_id = aws_api_gateway_rest_api.feature_flags.id
  parent_id   = aws_api_gateway_rest_api.feature_flags.root_resource_id
  path_part   = "flags"
}

resource "aws_api_gateway_resource" "consumer" {
  rest_api_id = aws_api_gateway_rest_api.feature_flags.id
  parent_id   = aws_api_gateway_rest_api.feature_flags.root_resource_id
  path_part   = "consumer"
}

resource "aws_api_gateway_resource" "consumer_auth" {
  rest_api_id = aws_api_gateway_rest_api.feature_flags.id
  parent_id   = aws_api_gateway_resource.consumer.id
  path_part   = "auth"
}

resource "aws_api_gateway_resource" "consumer_onboard" {
  rest_api_id = aws_api_gateway_rest_api.feature_flags.id
  parent_id   = aws_api_gateway_resource.consumer.id
  path_part   = "onboard"
}

resource "aws_api_gateway_method" "post_flags" {
  rest_api_id   = aws_api_gateway_rest_api.feature_flags.id
  resource_id   = aws_api_gateway_resource.flags.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.gateway_authorizer.id
}

resource "aws_api_gateway_method" "get_flags" {
  rest_api_id   = aws_api_gateway_rest_api.feature_flags.id
  resource_id   = aws_api_gateway_resource.flags.id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.gateway_authorizer.id
}

resource "aws_api_gateway_resource" "flags_flag_key" {
  rest_api_id = aws_api_gateway_rest_api.feature_flags.id
  parent_id   = aws_api_gateway_resource.flags.id
  path_part   = "{flagKey}"
}

resource "aws_api_gateway_method" "delete_flag" {
  rest_api_id   = aws_api_gateway_rest_api.feature_flags.id
  resource_id   = aws_api_gateway_resource.flags_flag_key.id
  http_method   = "DELETE"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.gateway_authorizer.id
}

resource "aws_api_gateway_method" "post_consumer_auth" {
  rest_api_id   = aws_api_gateway_rest_api.feature_flags.id
  resource_id   = aws_api_gateway_resource.consumer_auth.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "post_consumer_onboard" {
  rest_api_id   = aws_api_gateway_rest_api.feature_flags.id
  resource_id   = aws_api_gateway_resource.consumer_onboard.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "post_flags" {
  rest_api_id             = aws_api_gateway_rest_api.feature_flags.id
  resource_id             = aws_api_gateway_resource.flags.id
  http_method             = aws_api_gateway_method.post_flags.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.create_flag.invoke_arn
}

resource "aws_api_gateway_integration" "get_flags" {
  rest_api_id             = aws_api_gateway_rest_api.feature_flags.id
  resource_id             = aws_api_gateway_resource.flags.id
  http_method             = aws_api_gateway_method.get_flags.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.list_flags.invoke_arn
}

resource "aws_api_gateway_integration" "delete_flag" {
  rest_api_id             = aws_api_gateway_rest_api.feature_flags.id
  resource_id             = aws_api_gateway_resource.flags_flag_key.id
  http_method             = aws_api_gateway_method.delete_flag.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.delete_flag.invoke_arn
}

resource "aws_api_gateway_integration" "post_consumer_auth" {
  rest_api_id             = aws_api_gateway_rest_api.feature_flags.id
  resource_id             = aws_api_gateway_resource.consumer_auth.id
  http_method             = aws_api_gateway_method.post_consumer_auth.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.consumer_auth.invoke_arn
}

resource "aws_api_gateway_integration" "post_consumer_onboard" {
  rest_api_id             = aws_api_gateway_rest_api.feature_flags.id
  resource_id             = aws_api_gateway_resource.consumer_onboard.id
  http_method             = aws_api_gateway_method.post_consumer_onboard.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.consumer_auth.invoke_arn
}

resource "aws_api_gateway_deployment" "feature_flags" {
  rest_api_id = aws_api_gateway_rest_api.feature_flags.id

  depends_on = [
    aws_api_gateway_integration.post_flags,
    aws_api_gateway_integration.get_flags,
    aws_api_gateway_integration.delete_flag,
    aws_api_gateway_integration.post_consumer_auth,
    aws_api_gateway_integration.post_consumer_onboard,
    aws_api_gateway_method.post_flags,
    aws_api_gateway_method.get_flags,
    aws_api_gateway_method.delete_flag,
    aws_api_gateway_method.post_consumer_auth,
    aws_api_gateway_method.post_consumer_onboard,
    aws_api_gateway_authorizer.gateway_authorizer
  ]

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.flags.id,
      aws_api_gateway_resource.flags_flag_key.id,
      aws_api_gateway_resource.consumer.id,
      aws_api_gateway_resource.consumer_auth.id,
      aws_api_gateway_resource.consumer_onboard.id,
      aws_api_gateway_method.post_flags.id,
      aws_api_gateway_method.get_flags.id,
      aws_api_gateway_method.delete_flag.id,
      aws_api_gateway_method.post_consumer_auth.id,
      aws_api_gateway_method.post_consumer_onboard.id,
      aws_api_gateway_integration.post_flags.id,
      aws_api_gateway_integration.get_flags.id,
      aws_api_gateway_integration.delete_flag.id,
      aws_api_gateway_integration.post_consumer_auth.id,
      aws_api_gateway_integration.post_consumer_onboard.id,
      aws_api_gateway_authorizer.gateway_authorizer.id
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "dev" {
  rest_api_id   = aws_api_gateway_rest_api.feature_flags.id
  deployment_id = aws_api_gateway_deployment.feature_flags.id
  stage_name    = var.environment
}

resource "aws_api_gateway_method_settings" "default" {
  rest_api_id = aws_api_gateway_rest_api.feature_flags.id
  stage_name  = aws_api_gateway_stage.dev.stage_name
  method_path = "*/*"

  settings {
    throttling_burst_limit = 200
    throttling_rate_limit  = 100
    metrics_enabled        = true
    logging_level          = "INFO"
    data_trace_enabled     = false
  }
}

resource "aws_api_gateway_method_settings" "consumer_auth" {
  rest_api_id = aws_api_gateway_rest_api.feature_flags.id
  stage_name  = aws_api_gateway_stage.dev.stage_name
  method_path = "consumer/auth/POST"

  settings {
    throttling_burst_limit = 20
    throttling_rate_limit  = 10
    metrics_enabled        = true
    logging_level          = "INFO"
    data_trace_enabled     = false
  }
}

resource "aws_api_gateway_method_settings" "consumer_onboard" {
  rest_api_id = aws_api_gateway_rest_api.feature_flags.id
  stage_name  = aws_api_gateway_stage.dev.stage_name
  method_path = "consumer/onboard/POST"

  settings {
    throttling_burst_limit = 5
    throttling_rate_limit  = 2
    metrics_enabled        = true
    logging_level          = "INFO"
    data_trace_enabled     = false
  }
}

resource "aws_iam_role" "stream_publisher" {
  name = "${local.stream_publisher_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "stream_publisher_basic" {
  role       = aws_iam_role.stream_publisher.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "stream_publisher_vpc_access" {
  role       = aws_iam_role.stream_publisher.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "stream_publisher_stream_read" {
  name = "${local.stream_publisher_name}-stream-read"
  role = aws_iam_role.stream_publisher.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:DescribeStream",
          "dynamodb:GetRecords",
          "dynamodb:GetShardIterator",
          "dynamodb:ListStreams"
        ]
        Resource = aws_dynamodb_table.feature_flags.stream_arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "stream_publisher_kafka" {
  name = "${local.stream_publisher_name}-kafka"
  role = aws_iam_role.stream_publisher.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kafka:GetBootstrapBrokers"
        ]
        Resource = var.msk_cluster_arn
      },
      {
        Effect = "Allow"
        Action = [
          "kafka-cluster:Connect"
        ]
        Resource = var.msk_cluster_arn
      },
      {
        Effect = "Allow"
        Action = [
          "kafka-cluster:DescribeTopic",
          "kafka-cluster:WriteData"
        ]
        Resource = "${replace(var.msk_cluster_arn, ":cluster/", ":topic/")}/${var.kafka_topic}"
      }
    ]
  })
}

resource "aws_security_group" "stream_publisher" {
  name   = "${local.stream_publisher_name}-sg"
  vpc_id = var.lambda_vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_lambda_function" "stream_publisher" {
  function_name    = local.stream_publisher_name
  role             = aws_iam_role.stream_publisher.arn
  handler          = "dynamodb_stream_handler.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.stream_publisher.output_path
  source_code_hash = data.archive_file.stream_publisher.output_base64sha256
  timeout          = 30

  vpc_config {
    subnet_ids         = var.lambda_subnet_ids
    security_group_ids = [aws_security_group.stream_publisher.id]
  }

  environment {
    variables = {
      TABLE_NAME      = aws_dynamodb_table.feature_flags.name
      MSK_CLUSTER_ID  = var.msk_cluster_id
      KAFKA_CLIENT_ID = var.kafka_client_id
      KAFKA_TOPIC     = var.kafka_topic
    }
  }
}

resource "aws_lambda_event_source_mapping" "feature_flags_stream" {
  event_source_arn                   = aws_dynamodb_table.feature_flags.stream_arn
  function_name                      = aws_lambda_function.stream_publisher.arn
  starting_position                  = "LATEST"
  batch_size                         = var.stream_batch_size
  maximum_batching_window_in_seconds = var.stream_maximum_batching_window_seconds
  enabled                            = true
}

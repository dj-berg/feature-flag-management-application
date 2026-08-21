variable "aws_region" {
  description = "AWS region to deploy resources into"
  type        = string
  default     = "us-east-1"
}

variable "vpc_id" {
  description = "VPC ID where Centrifugo and MSK live"
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for the Centrifugo Fargate task"
  type        = list(string)
}

variable "msk_bootstrap_brokers_iam" {
  description = "MSK IAM bootstrap brokers string"
  type        = string
}

variable "msk_security_group_id" {
  description = "Security group ID for the existing MSK cluster"
  type        = string
}

variable "msk_cluster_arn" {
  description = "MSK cluster ARN"
  type        = string
}

variable "topic_name" {
  description = "Kafka topic name"
  type        = string
  default     = "feature-flag-changes"
}

variable "dynamodb_table_arn" {
  description = "DynamoDB table ARN for feature flags"
  type        = string
}

variable "my_ip_cidr" {
  description = "Your public IP in CIDR form, used to lock down Centrifugo access"
  type        = string
}

variable "centrifugo_image" {
  description = "Pinned Centrifugo Docker image"
  type        = string
  default     = "centrifugo/centrifugo:v6.7.1"
}

variable "centrifugo_log_level" {
  description = "Centrifugo log level"
  type        = string
  default     = "info"
}

variable "centrifugo_desired_count" {
  description = "Desired number of Centrifugo ECS tasks"
  type        = number
  default     = 1
}

variable "centrifugo_deployment_minimum_healthy_percent" {
  description = "Minimum healthy percent during ECS deployment"
  type        = number
  default     = 100
}

variable "centrifugo_deployment_maximum_percent" {
  description = "Maximum percent during ECS deployment"
  type        = number
  default     = 200
}

variable "centrifugo_alb_certificate_arn" {
  description = "ACM certificate ARN required for HTTPS/WSS on the public ALB."
  type        = string
  default     = ""
}

variable "centrifugo_client_allowed_origins" {
  description = "Allowed browser origins for Centrifugo client connections"
  type        = list(string)
  default = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    "http://127.0.0.1:3003",
  ]
}

variable "centrifugo_domain_name" {
  description = "Optional stable DNS hostname for Centrifugo (for example, realtime.example.com)."
  type        = string
  default     = ""

  validation {
    condition = (
      trimspace(var.centrifugo_domain_name) == "" && trimspace(var.centrifugo_route53_zone_id) == ""
      ) || (
      trimspace(var.centrifugo_domain_name) != "" && trimspace(var.centrifugo_route53_zone_id) != ""
    )
    error_message = "Set both centrifugo_domain_name and centrifugo_route53_zone_id together, or leave both empty."
  }
}

variable "centrifugo_route53_zone_id" {
  description = "Optional Route53 hosted zone ID used to create alias records for centrifugo_domain_name."
  type        = string
  default     = ""
}

variable "consumer_jwt_public_key" {
  description = "RS256 public key (PEM) used to verify scoped consumer JWTs issued by /consumer/auth"
  type        = string
  default     = ""
  sensitive   = true

  validation {
    condition     = trimspace(var.consumer_jwt_public_key) != ""
    error_message = "consumer_jwt_public_key must be provided explicitly; do not deploy with an empty or placeholder key."
  }
}

variable "consumer_jwt_secret" {
  description = "Deprecated. Previously used for HS256 verification; ignored after RS256 migration."
  type        = string
  default     = ""
  sensitive   = true
}

variable "consumer_jwt_issuer" {
  description = "Expected issuer claim for consumer JWTs used by Centrifugo"
  type        = string
  default     = "feature-flag-platform"
}

variable "consumer_jwt_audience" {
  description = "Expected audience claim for consumer JWTs used by Centrifugo"
  type        = string
  default     = "feature-flag-api"
}

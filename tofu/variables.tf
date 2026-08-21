variable "aws_region" {
  description = "AWS region to deploy resources into"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "feature-flag-management-application"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
}

variable "cognito_region" {
  description = "Cognito region for token verification"
  type        = string
  default     = "us-east-1"
}

variable "cognito_user_pool_id" {
  description = "Cognito user pool id"
  type        = string
  default     = ""
}

variable "required_scopes" {
  description = "Comma-separated list of required scopes"
  type        = string
  default     = ""
}

variable "applications_table_name" {
  description = "Name for the app-data metadata table"
  type        = string
  default     = ""
}

variable "feature_flags_table_name" {
  description = "Name for the tenant-aware feature flags table"
  type        = string
  default     = ""
}

variable "jwt_issuer" {
  description = "Issuer used for consumer JWT tokens"
  type        = string
  default     = "feature-flag-platform"
}

variable "jwt_audience" {
  description = "Audience claim for consumer JWT tokens"
  type        = string
  default     = "feature-flag-api"
}

variable "jwt_expires_in_seconds" {
  description = "Lifetime for consumer JWT tokens in seconds"
  type        = number
  default     = 900
}

variable "jwt_private_key" {
  description = "RS256 private key (PEM) used for consumer JWT signing"
  type        = string
  default     = ""
  sensitive   = true

  validation {
    condition     = trimspace(var.jwt_private_key) != ""
    error_message = "jwt_private_key must be provided explicitly; do not deploy with an empty or placeholder key."
  }
}

variable "jwt_public_key" {
  description = "RS256 public key (PEM) used for consumer JWT verification"
  type        = string
  default     = ""
  sensitive   = true

  validation {
    condition     = trimspace(var.jwt_public_key) != ""
    error_message = "jwt_public_key must be provided explicitly; do not deploy with an empty or placeholder key."
  }
}

variable "jwt_secret" {
  description = "Deprecated. Previously used for HS256 signing; ignored after RS256 migration."
  type        = string
  default     = ""
  sensitive   = true
}

variable "onboarding_api_key" {
  description = "Optional API key required by POST /consumer/onboard via x-onboarding-api-key"
  type        = string
  default     = ""
  sensitive   = true
}

variable "msk_cluster_id" {
  description = "MSK cluster ID"
  type        = string
  default     = "REPLACE_WITH_MSK_CLUSTER_ID"
}

variable "msk_cluster_arn" {
  description = "Full ARN of the MSK cluster used by the stream publisher"
  type        = string
  default     = "REPLACE_WITH_MSK_CLUSTER_ARN"
}

variable "kafka_client_id" {
  description = "Kafka client id"
  type        = string
  default     = "feature-flag-management-application"
}

variable "kafka_topic" {
  description = "Kafka topic to publish to"
  type        = string
  default     = "feature-flag-changes"
}

variable "lambda_vpc_id" {
  description = "VPC ID for the stream publisher Lambda"
  type        = string
  default     = "REPLACE_WITH_LAMBDA_VPC_ID"
}

variable "lambda_subnet_ids" {
  description = "Subnet IDs for the stream publisher Lambda"
  type        = list(string)
  default = [
    "REPLACE_WITH_LAMBDA_SUBNET_ID",
  ]
}

variable "stream_batch_size" {
  description = "DynamoDB stream batch size for stream-publisher Lambda"
  type        = number
  default     = 10
}

variable "stream_maximum_batching_window_seconds" {
  description = "Maximum batching window in seconds for DynamoDB stream event source mapping"
  type        = number
  default     = 1
}

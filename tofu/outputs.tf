output "feature_flags_table_name" {
  description = "Name of the DynamoDB feature flags table"
  value       = aws_dynamodb_table.feature_flags.name
}

output "feature_flags_table_arn" {
  description = "ARN of the DynamoDB feature flags table"
  value       = aws_dynamodb_table.feature_flags.arn
}

output "applications_table_name" {
  description = "Name of the DynamoDB applications metadata table"
  value       = aws_dynamodb_table.applications.name
}

output "applications_table_arn" {
  description = "ARN of the DynamoDB applications metadata table"
  value       = aws_dynamodb_table.applications.arn
}

output "gateway_authorizer_lambda_name" {
  description = "Name of the Lambda authorizer"
  value       = aws_lambda_function.gateway_authorizer.function_name
}

output "gateway_authorizer_lambda_arn" {
  description = "ARN of the Lambda authorizer"
  value       = aws_lambda_function.gateway_authorizer.arn
}

output "api_gateway_id" {
  description = "API Gateway REST API ID"
  value       = aws_api_gateway_rest_api.feature_flags.id
}

output "api_gateway_execution_arn" {
  description = "Execution ARN for the API Gateway"
  value       = aws_api_gateway_rest_api.feature_flags.execution_arn
}

output "consumer_auth_lambda_name" {
  description = "Name of the consumer auth Lambda"
  value       = aws_lambda_function.consumer_auth.function_name
}

output "consumer_auth_lambda_arn" {
  description = "ARN of the consumer auth Lambda"
  value       = aws_lambda_function.consumer_auth.arn
}

output "consumer_auth_endpoint" {
  description = "Consumer auth endpoint"
  value       = "https://${aws_api_gateway_rest_api.feature_flags.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_api_gateway_stage.dev.stage_name}/consumer/auth"
}

output "consumer_onboard_endpoint" {
  description = "Consumer onboarding endpoint"
  value       = "https://${aws_api_gateway_rest_api.feature_flags.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_api_gateway_stage.dev.stage_name}/consumer/onboard"
}

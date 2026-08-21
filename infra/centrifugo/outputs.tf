output "hmac_secret" {
  description = "HMAC secret used to sign Centrifugo client JWTs"
  value       = random_password.hmac.result
  sensitive   = true
}

output "ecs_cluster_name" {
  description = "Centrifugo ECS cluster name"
  value       = aws_ecs_cluster.centrifugo.name
}

output "ecs_service_name" {
  description = "Centrifugo ECS service name"
  value       = aws_ecs_service.centrifugo.name
}

output "cloudwatch_log_group_name" {
  description = "CloudWatch log group for Centrifugo"
  value       = aws_cloudwatch_log_group.centrifugo.name
}

output "centrifugo_security_group_id" {
  description = "Security group used by the Centrifugo service"
  value       = aws_security_group.centrifugo.id
}

output "centrifugo_alb_dns_name" {
  description = "Public DNS name of Centrifugo ALB"
  value       = aws_lb.centrifugo.dns_name
}

output "centrifugo_domain_name" {
  description = "Stable Centrifugo domain name when configured"
  value       = trimspace(var.centrifugo_domain_name)
}

output "centrifugo_uses_custom_domain" {
  description = "Whether Centrifugo client URLs are published using centrifugo_domain_name"
  value       = trimspace(var.centrifugo_domain_name) != ""
}

output "centrifugo_public_base_url" {
  description = "Public base URL for Centrifugo clients"
  value       = local.centrifugo_public_base_url
}

output "centrifugo_websocket_url" {
  description = "Public WebSocket URL for Centrifugo client transport"
  value       = local.centrifugo_websocket_url
}

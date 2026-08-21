# Security

Do not disclose vulnerabilities or credentials in public issues. Use the
repository host's private security-advisory process when available, and include
enough detail to reproduce the concern safely without sharing secrets or
personal data.

Never commit `.env` files, private keys, tokens, OpenTofu state, plans, generated archives, or production configuration. If a secret is exposed, revoke or rotate it immediately through the owning service and then remove it from the working tree and history using the organization's incident process.

If a secret may have entered Git history, pause publication, revoke or rotate
the credential, preserve the evidence for incident response, and obtain an
approved decision on history remediation. Removing a file in a later commit
does not remove the historical exposure.

Security checks run in CI without AWS, Kafka, Centrifugo, or production credentials. Dependency audit findings should be reviewed before merging; do not suppress a finding by weakening the gate without documenting the reason.

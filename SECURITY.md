# Security Policy

## Supported Versions

Only the latest release gets security fixes. That is the release marked as
**Latest** on the Releases page, and it is the one running in production.

| Version                          | Supported          |
| -------------------------------- | ------------------ |
| Latest release (currently 0.1.x) | :white_check_mark: |
| Any older release                | :x:                |

## Reporting a Vulnerability

**Please do not open a public issue.** Report it privately from the
**Security** tab of this repository, using **Report a vulnerability**. Only
the maintainers can see it.

It helps a lot if you include:

- What part is affected (web app, an API route, the deploy, etc.).
- Steps to reproduce it, or a proof of concept.
- What an attacker could do with it.

### Scope

**In scope:** the web app, the APIs of the backend services, and the
deployment and configuration files in this repository.

**Out of scope:**

- Third party services, like GitHub or the GitHub Container Registry.
- Networks and servers that are not part of this project.
- Denial of service attacks, spam or social engineering.
- Theoretical issues with no way to actually exploit them.

### What to expect

We answer every report on a best effort basis:

- We confirm we got the report **as soon as we can**.
- We keep you posted when there is progress, until it is closed.
- **If it is accepted**, we aim to fix it within these times, counted from
  the moment we confirm it:

  | Severity | Fix within      |
  | -------- | --------------- |
  | Critical | 7 days          |
  | High     | 30 days         |
  | Medium   | 90 days         |
  | Low      | When possible   |

  When the fix is released we publish a security advisory, with credit to
  you if you want it.
- **If it is declined**, we explain why (for example, it can not be
  reproduced or it is out of scope) and you are free to ask us to look at
  it again with more details.

Please give us the time above to fix the issue before sharing it publicly.

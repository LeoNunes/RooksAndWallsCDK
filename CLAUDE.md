# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

```bash
npm run build   # Compile TypeScript
npm run test    # Run Jest tests
cdk synth       # Emit CloudFormation templates
cdk diff        # Compare deployed vs local state
cdk deploy      # Manual deploy — only needed for initial setup in a new account
```

## Architecture

The pipeline is **self-mutating**: after the first manual `cdk deploy`, all infrastructure changes are deployed automatically on push to `main`. `lib/config/config.ts` is the single source of truth for all environment settings (AWS account, DNS, GitHub repos, subdomains, instance types).

**Web pipeline:** triggered by pushes to `RooksAndWallsWeb` main. Builds once, then for each environment writes an environment-specific `envConfig.json` (derived from CDK config) alongside `dist/` to S3 and invalidates CloudFront.

**Backend pipeline:** triggered by pushes to `RooksAndWallsServer` main. Runs `./gradlew test buildFatJar`, then deploys via CodeDeploy using `aws/appspec.yml`. EC2 instances are bootstrapped via cfn-init and receive infrastructure env vars through `/etc/games/infra.env`.

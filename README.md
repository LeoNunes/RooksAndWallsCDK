# Rooks and Walls - Infrastructure as Code

## Introduction
This project creates the infrastructure to run Rooks And Walls.  
The initial deployment creates the CDK Pipeline that manages the deployment of the rest of the infrastructure. Because of that, you should only deploy manually if deploying in a new account.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template

## Web
### Infrastructure

Each web environment is deployed to `us-east-1` (required by CloudFront for ACM certificates). The stack creates:

- **S3 bucket** — private, stores the built static assets. Named `${appName}-web-${envName}` (lowercased, e.g. `games-web-beta`).
- **ACM certificate** — DNS-validated certificate for the environment's domain (e.g. `beta.games.leonunes.me`).
- **CloudFront distribution** — serves the S3 assets globally over HTTPS with Origin Access Control. Custom domain and certificate are attached.
- **Route53 A record** — alias record pointing the environment's subdomain to the CloudFront distribution.
- **SSM parameter** — stores the CloudFront distribution ID at `/${appName}/WEB/${envName}/DistributionId` so the `WebPipeline` can read it at deploy time without a direct CloudFormation dependency.

### WebPipeline

The `WebPipeline` (in the `Games-WEB-Common` stack) is a CodePipeline that deploys the web application. It is triggered by pushes to the `main` branch of `RooksAndWallsWeb`.

**Stages:**

1. **Source** — pulls the source from GitHub via CodeStar Connections.
2. **Build** — CodeBuild runs `npm ci && npm run build`, producing the static `dist/` output as a build artifact. This single build is shared across all deployment waves.
3. **Deploy-Wave-N** — for each environment wave, a CodeBuild action:
   - Reads the CloudFront distribution ID from SSM.
   - Reads Cognito User Pool ID and Client ID from SSM.
   - Writes `envConfig.json` with environment-specific values derived from the CDK config.
   - Runs `aws s3 sync` to upload the build artifact and `envConfig.json` to the environment's S3 bucket.
   - Runs `aws cloudfront create-invalidation` to flush the CDN cache.

### envConfig.json

The frontend app fetches `/envConfig.json` at startup to get environment-specific configuration. This file is not stored in the frontend repository — it is written to S3 by the `WebPipeline` deploy step. Its shape is:

```json
{
  "apiBaseUrl": "https://beta.api.games.leonunes.me",
  "wsBaseUrl": "wss://beta.api.games.leonunes.me",
  "cognitoUserPoolId": "<COGNITO_USER_POOL_ID>",
  "cognitoUserPoolClientId": "<COGNITO_USER_POOL_CLIENT_ID>",
  "cognitoDomain": "games-beta.auth.us-west-2.amazoncognito.com"
}
```

- `apiBaseUrl` / `wsBaseUrl` are constructed from `BackendEnvironmentConfig.subdomain` + `DnsConfig.hostedZoneName` in `lib/config/config.ts`.
- `cognitoUserPoolId` / `cognitoUserPoolClientId` are read from SSM at deploy time (written by the backend stack).
- `cognitoDomain` is constructed from `BackendEnvironmentConfig.auth.cognitoDomain` + the AWS region.

## Service
### Environment Variables
The infrastructure creates `/etc/games/infra.env` with infrastructure-owned variables used by deployment scripts and Nginx templating. These are the variables defined in it:

**GAMES_PORT**: The port the application should be listening to.

**GAMES_ENVIRONMENT**: Environment identifier in lowercase (for example `beta`).

**GAMES_SECRET_NAME**: Secrets Manager secret name used by deployment scripts.

**GAMES_SERVER_NAME**: Fully-qualified host for the environment (for example `beta.api.games.leonunes.me`) used to render Nginx `server_name` and Certbot domain.

**GAMES_HOSTED_ZONE_NAME**: DNS zone name (for example `leonunes.me`).

**GAMES_COGNITO_USER_POOL_ID**: Cognito User Pool ID for the environment, used by the backend for token validation.

**GAMES_COGNITO_REGION**: AWS region where the Cognito User Pool is deployed.

**GAMES_USERS_TABLE_NAME**: DynamoDB Users table name for the environment (for example `games-beta-users`).

## Cognito

Each backend environment provisions a Cognito **User Pool** for player authentication. The construct (`lib/backend/constructs/cognito.ts`) creates:

- **User Pool** — self sign-up enabled, email sign-in alias, email auto-verification, minimum 8-character password policy.
- **Google OAuth Identity Provider** — client credentials read from Secrets Manager (`games/google-oauth`). Scopes: `email`, `openid`, `profile`.
- **User Pool Client** — SRP auth flow; Authorization Code Grant with `email`, `openid`, and `profile` OAuth scopes. Callback/logout URLs include the environment's web subdomain. If `development.localWebUrl` is set in the environment config, that URL (and its `/oauth/callback` variant) is also added to the allowed callback URLs, and the URL alone is added to the allowed logout URLs.
- **User Pool Domain** — hosted UI domain prefix from `BackendEnvironmentConfig.auth.cognitoDomain` (for example `games-beta`).
- **SSM parameters** — the pool ID and client ID are stored at `/{appName}/BE/{envName}/CognitoUserPoolId` and `/{appName}/BE/{envName}/CognitoUserPoolClientId` so the `WebPipeline` can read them without a direct stack dependency.

## DynamoDB

### Users Table

Each backend environment has a **Users** table (`lib/backend/constructs/users-table.ts`):

- **Table name:** `{appName}-{envName}-users` (lowercased, e.g. `games-beta-users`).
- **Partition key:** `userId` (String).
- **Billing mode:** PAY_PER_REQUEST.
- **Global Secondary Index:** `displayName-index` — partition key `displayName` (String), KEYS_ONLY projection.
- EC2 instance role is granted read/write data access to the table.
- If `development.allowLocalDdbAccess` is `true` in the environment config, an additional IAM role named `games-{envName}-local-dev` is created (e.g. `games-beta-local-dev`). Any IAM principal in the same AWS account can assume it, granting read/write access to the table for local development.

## Local Development

Each environment can opt into local development support via the `development` key in its `EnvironmentConfig`:

```ts
development: {
    localWebUrl: 'http://localhost:5173',  // added to Cognito callback/logout URLs
    allowLocalDdbAccess: true,             // creates an assumable IAM role for DynamoDB
}
```

### Connecting to DynamoDB locally

When `allowLocalDdbAccess` is `true`, an IAM role is created that you can assume to get temporary credentials scoped to the environment's DynamoDB table:

```bash
aws sts assume-role \
  --role-arn arn:aws:iam::<account-id>:role/games-beta-local-dev \
  --role-session-name local-dev
```

Export the returned `AccessKeyId`, `SecretAccessKey`, and `SessionToken` as `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN`, then run the server with the appropriate environment variables:

```
GAMES_COGNITO_REGION=us-west-2
GAMES_COGNITO_USER_POOL_ID=<user-pool-id>
GAMES_USERS_TABLE_NAME=games-beta-users
```

### Running the web frontend locally

With `localWebUrl` configured, Cognito already allows `http://localhost:5173` as a redirect target. Update `RooksAndWallsWeb/public/envConfig.json` with the real Cognito values for the environment (User Pool ID, Client ID, domain) and run `npm run dev` as normal.

## EC2 Instances
### CFN-INIT

Instances are being configured using cfn-init. The configuration process includes installing and running CloudWatch and CodeDeploy agents.

Configuring cfn-init can be done as in the example in [this documentation](https://docs.aws.amazon.com/cdk/api/v1/docs/aws-ec2-readme.html#configuring-instances-using-cloudformation-init-cfn-init).  

For debugging, the logs are found at `/var/log/cfn-init.log` and `/var/log/cfn-init-cmd.log`.
There is also a local copy of the init template at `/var/lib/cfn-init/data/metadata.json`.
The instance's user data contains the command that executes cfn-init. You can check the parameters (e.g ConfigSet) by looking at it.

**References:**  
[cfn-auto-reloader](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-hup.html)

## CloudWatch

CloudWatch agent is initialized with the instance to send metrics and logs to CloudWatch.  
We are installing and running it using cfn-init.
Check [this link](https://aws.amazon.com/pt/blogs/mt/manage-amazon-cloudwatch-agent-deployment-at-scale-using-the-aws-cloud-development-kit-to-optimize-aws-usage/) for details on the installation process.

By default, the agent gets the configuration from `/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json`.

To check if CloudWatch agent is running on the instance, ssh into it and run:
```bash
amazon-cloudwatch-agent-ctl -a status
```

To manually start it:
```bash
amazon-cloudwatch-agent-ctl -a start
```

**References:**  
[Create the CloudWatch agent configuration file with the wizard](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/create-cloudwatch-agent-configuration-file-wizard.html)  
[CloudWatch configuration file](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html)  
[Troubleshooting](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/troubleshooting-CloudWatch-Agent.html)

## CodeDeploy

This project is using AWS CodeDeploy to deploy the application to the EC2 instances.  
For the deployment process to work, the instance must be running the CodeDeploy agent.

We are installing and running it using cfn-init.
Check [this link](https://docs.aws.amazon.com/codedeploy/latest/userguide/codedeploy-agent-operations-install-linux.html) for details on the installation process.

To check if CodeDeploy agent is running on the instance, ssh into it and run:
``` bash
sudo service codedeploy-agent status
```

To manually start it:
``` bash
sudo service codedeploy-agent start
```

(?) CodeDeploy logs are located at `/opt/codedeploy-agent/deployment-root/{deployment-group-ID}/{deployment-ID}/logs/scripts.log`.
Logs are being sent to CloudWatch, following the instructions [here](https://docs.aws.amazon.com/codedeploy/latest/userguide/codedeploy-agent-operations-cloudwatch-agent.html)

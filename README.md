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

## Service
### Environment Variables
The infrastructure creates `/etc/games/infra.env` with infrastructure-owned variables used by deployment scripts and Nginx templating. These are the variables defined in it:

**GAMES_PORT**: The port the application should be listening to.

**GAMES_ENVIRONMENT**: Environment identifier in lowercase (for example `beta`).

**GAMES_SECRET_NAME**: Secrets Manager secret name used by deployment scripts.

**GAMES_SERVER_NAME**: Fully-qualified host for the environment (for example `beta.api.games.leonunes.me`) used to render Nginx `server_name` and Certbot domain.

**GAMES_HOSTED_ZONE_NAME**: DNS zone name (for example `leonunes.me`).

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

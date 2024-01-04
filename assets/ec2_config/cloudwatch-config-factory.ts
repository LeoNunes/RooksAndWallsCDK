export default function cloudWatchConfigFactory(appName: string, envName: string) {
    return {
        agent: {
            metrics_collection_interval: 30,
            run_as_user: 'root',
        },
        logs: {
            logs_collected: {
                files: {
                    collect_list: [
                        {
                            file_path:
                                '/opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log',
                            log_group_name: `${appName}/${envName}/cloudwatch-agent-log`,
                            log_stream_name: '{instance_id}-agent-log',
                            retention_in_days: 7,
                        },
                        {
                            file_path: '/var/log/aws/codedeploy-agent/codedeploy-agent.log',
                            log_group_name: `${appName}/${envName}/codedeploy-agent-log`,
                            log_stream_name: '{instance_id}-agent-log',
                            retention_in_days: 7,
                        },
                        {
                            file_path:
                                '/opt/codedeploy-agent/deployment-root/deployment-logs/codedeploy-agent-deployments.log',
                            log_group_name: `${appName}/${envName}/codedeploy-agent-deployment-log`,
                            log_stream_name: '{instance_id}-codedeploy-agent-deployment-log',
                            retention_in_days: 7,
                        },
                        {
                            file_path: '/tmp/codedeploy-agent.update.log',
                            log_group_name: `${appName}/${envName}/codedeploy-agent-updater-log`,
                            log_stream_name: '{instance_id}-codedeploy-agent-updater-log',
                            retention_in_days: 7,
                        },
                    ],
                },
            },
        },
        metrics: {
            aggregation_dimensions: [['InstanceId']],
            append_dimensions: {
                AutoScalingGroupName: '${aws:AutoScalingGroupName}',
                ImageId: '${aws:ImageId}',
                InstanceId: '${aws:InstanceId}',
                InstanceType: '${aws:InstanceType}',
            },
            metrics_collected: {
                disk: {
                    measurement: ['used_percent'],
                    metrics_collection_interval: 30,
                    resources: ['*'],
                },
                mem: {
                    measurement: ['mem_used_percent'],
                    metrics_collection_interval: 30,
                },
            },
        },
    };
}

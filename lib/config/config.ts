import { finalConfig } from './config_def';

const appName = 'Games';
const gitHubConfig = {
    owner: 'LeoNunes',
    // Connection must be created manually on the AWS Console
    connectionARN:
        'arn:aws:codestar-connections:sa-east-1:641179121252:connection/4c171f9b-5424-4003-b7e3-ea9f41c7a7ca',
};

export default finalConfig({
    appName: appName,
    awsEnvironment: {
        account: '641179121252',
        region: 'us-west-2',
    },
    dns: {
        hostedZoneId: 'Z06232281J47SNE8ZWHNB',
        hostedZoneName: 'leonunes.me',
        commonSubdomain: 'api.games',
    },
    cdk: {
        pipeline: {
            repo: {
                ...gitHubConfig,
                name: 'RooksAndWallsCDK',
                branch: 'main',
            },
        },
    },
    backend: {
        pipeline: {
            repo: {
                ...gitHubConfig,
                name: 'RooksAndWallsServer',
                branch: 'main',
            },
        },
        environments: [
            {
                name: 'Beta',
                description: `Beta environment for ${appName}`,
                subdomain: 'beta',
                application: {
                    httpsEnabled: true,
                    servicePort: 8080,
                },
                healthCheck: {
                    path: '/ping',
                },
            },
        ],
    },
});

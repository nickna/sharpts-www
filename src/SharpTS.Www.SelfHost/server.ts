import { loadServerConfig, loadSupervisorConfig } from './config';
import { createHttpServer } from './http-server';
import { createSupervisor } from './supervisor-runtime';

const config = loadServerConfig();
const supervisor = createSupervisor(loadSupervisorConfig());
const application = createHttpServer(config, supervisor);

process.on('SIGTERM', () => application.beginShutdown('SIGTERM'));
process.on('SIGINT', () => application.beginShutdown('SIGINT'));

application.server.listen(config.port, config.host, () => {
    const address = application.server.address();
    console.log(JSON.stringify({
        event: 'server_listening',
        address: address.address,
        port: address.port,
        contentRoot: config.contentRoot
    }));
});

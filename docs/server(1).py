import logging
from hbmqtt.broker import Broker
from hbmqtt.mqtt.constants import QOS_0
from asyncio import get_event_loop, sleep

# Logging config
logging.basicConfig(
    level=logging.INFO,
    format='[%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)

# Auth credentials
AUTH_CREDENTIALS = {
    'admin': 'password'  # ⚠️ MODIFY: Default username & password. Replace for production use.
}

# MQTT Broker config
BROKER_CONFIG = {
    'listeners': {
        'default': {
            'type': 'tcp',
            'bind': '10.10.116.197:1883',  # ⚠️ MODIFY: Server IP and port. Use your actual server address.
            'max_connections': 1000  # ⚠️ OPTIONAL: Adjust max client connections as needed
        }
    },
    'auth': {
        'allow-anonymous': False,  # ⚠️ OPTIONAL: Set True to allow anonymous clients (not recommended for production)
        'password-file': None,  # ⚠️ OPTIONAL: Set file path if you use external password file
        'plugins': ['auth_credentials']
    },
    'topic-check': {
        'enabled': False  # ⚠️ OPTIONAL: Enable topic permission check if required
    }
}

async def auth_handler(client_id, username, password, properties):
    if not username or not password:
        logger.error(f'[Connection Rejected] Client {client_id} missing username or password')
        return False

    user = username.decode('utf-8')
    passwd = password.decode('utf-8')

    if user in AUTH_CREDENTIALS and AUTH_CREDENTIALS[user] == passwd:
        logger.info(f'[Connected] Client {client_id} (User: {user}) connected successfully')
        return True
    else:
        logger.error(f'[Connection Rejected] Client {client_id} invalid username or password (User: {user})')
        return False

async def on_broker_event(event):
    event_type = event['type']
    client_id = event['client_id']

    if event_type == 'client_connected':
        logger.info(f'[Client Connected] ID: {client_id}')
    elif event_type == 'client_disconnected':
        logger.info(f'[Client Disconnected] ID: {client_id}')
    elif event_type == 'session_subscribed':
        topics = [t[0] for t in event['topics']]
        logger.info(f'[Subscribe] Client {client_id} subscribed to: {", ".join(topics)}')
    elif event_type == 'session_unsubscribed':
        topics = event['topics']
        logger.info(f'[Unsubscribe] Client {client_id} unsubscribed from: {", ".join(topics)}')
    elif event_type == 'message_published':
        packet = event['packet']
        topic = packet.topic
        payload = packet.payload.data.decode('utf-8')
        if topic == 'server/runstate':  # ⚠️ OPTIONAL: Change monitor topic for your business
            logger.info(f'[server/runstate] {payload}')

async def start_broker():
    broker = Broker(config=BROKER_CONFIG, loop=get_event_loop())
    broker.auth_provider.add_auth_handler(auth_handler)
    broker.events.subscribe(on_broker_event)

    try:
        await broker.start()
        logger.info('========================================')
        logger.info('  MQTT Server Started')
        logger.info(f'  Address: 10.10.116.197:1883')  # ⚠️ MODIFY: Keep consistent with the "bind" address above
        logger.info(f'  Username: admin')  # ⚠️ MODIFY: Match username in AUTH_CREDENTIALS
        logger.info(f'  Password: Aewde2342xsd')  # ⚠️ MODIFY: Fix mismatch! Must match password in AUTH_CREDENTIALS
        logger.info(f'  Monitor Topic: server/runstate')  # ⚠️ OPTIONAL: Match the monitor topic above
        logger.info('========================================')

        while True:
            await sleep(3600)
    except Exception as e:
        logger.error(f'Broker startup failed: {e}')
        await broker.shutdown()

if __name__ == '__main__':
    loop = get_event_loop()
    try:
        loop.run_until_complete(start_broker())
    except KeyboardInterrupt:
        logger.info('Process interrupted, shutting down broker...')
        loop.run_until_complete(sleep(1))
        loop.close()
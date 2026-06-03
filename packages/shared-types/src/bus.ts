export const BUS_TOPICS = {
  MESSAGE_INBOUND: 'platform.message.inbound',
  MESSAGE_OUTBOUND: 'platform.message.outbound',
  PLATFORM_EVENT: 'platform.events',
} as const;

export type BusTopic = (typeof BUS_TOPICS)[keyof typeof BUS_TOPICS];

export declare const BUS_TOPICS: {
    readonly MESSAGE_INBOUND: "platform.message.inbound";
    readonly MESSAGE_OUTBOUND: "platform.message.outbound";
    readonly PLATFORM_EVENT: "platform.events";
};
export type BusTopic = (typeof BUS_TOPICS)[keyof typeof BUS_TOPICS];
//# sourceMappingURL=bus.d.ts.map
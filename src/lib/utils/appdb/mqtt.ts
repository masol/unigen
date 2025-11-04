import mqtt, { type MqttClient } from 'mqtt';
import { softinfo } from '../softinfo';
import { logger } from '../logger';
import { eventBus } from '../evt';
import { projectStore } from '$lib/stores/project/project.svelte';
import { invoke } from '@tauri-apps/api/core';

type ConfigData = {
    key: string;
    cfgid: string | null
}

type FocusData = {
    path: string;
}

interface EventBusMessage {
    type: string;
    sender: number;
    data: ConfigData | Record<string, unknown>;
}

export class Mqtt {
    private client: MqttClient | null = null;
    private isConnected: boolean = false;
    private readonly brokerUrl: string = 'ws://127.0.0.1:38286';
    private readonly clientId: string = crypto.randomUUID();
    private readonly channel: string = 'evtbus';
    private initResolve: (() => void) | null = null;

    /**
     * 初始化并连接到MQTT服务器
     */
    async init(): Promise<void> {
        // 为方便初始化顺序安排，clientId使用uuid.这可以在softinfo之前开始初始化。
        // this.clientId = `unigen-${softinfo.pid}`;
        return new Promise((resolve) => {
            this.initResolve = resolve;
            this.connect();
        });
    }

    /**
     * 连接到MQTT服务器
     */
    private connect(): void {
        try {
            console.log(`尝试连接到 ${this.brokerUrl}...`);

            this.client = mqtt.connect(this.brokerUrl, {
                clientId: this.clientId,
                clean: true,
                reconnectPeriod: 3000, // 使用原生自动重连，3秒重连间隔
                connectTimeout: 60000, // 连接超时时间
            });

            this.client.on('connect', () => {
                console.log('MQTT连接成功');
                this.isConnected = true;

                // 订阅频道
                this.client?.subscribe(this.channel, (err) => {
                    if (err) {
                        console.error(`订阅频道 ${this.channel} 失败:`, err);
                    } else {
                        console.log(`已订阅频道: ${this.channel}`);
                    }
                });

                // 首次连接成功时resolve Promise
                if (this.initResolve) {
                    this.initResolve();
                    this.initResolve = null;
                }
            });

            this.client.on('reconnect', () => {
                console.log('正在重新连接到MQTT服务器...');
            });

            this.client.on('message', (topic, message) => {
                if (topic === this.channel) {
                    try {
                        const data = JSON.parse(message.toString());
                        this.processMessage(data);
                    } catch (error) {
                        console.error('解析消息失败:', error);
                        console.log('原始消息:', message.toString());
                    }
                }
            });

            this.client.on('error', (error) => {
                console.error('MQTT连接错误:', error.message);
                this.isConnected = false;
            });

            this.client.on('close', () => {
                console.log('MQTT连接已关闭');
                this.isConnected = false;
            });

            this.client.on('offline', () => {
                console.log('MQTT客户端离线');
                this.isConnected = false;
            });

        } catch (error) {
            console.error('连接异常:', error);
        }
    }

    private processMessage(msg: EventBusMessage) {
        if (msg.sender === softinfo.pid) {
            // 忽略自己发送的消息。
            return;
        }

        console.log('处理消息:', msg);
        switch (msg.type) {
            case 'config':
                {
                    const data = msg.data as ConfigData;
                    eventBus.emit(`cfgchanged:${data.key}`, data)
                }
                break;
            case 'focus':
                {
                    const data = msg.data as FocusData;
                    const currentRepo = projectStore.currentRepository;
                    if (currentRepo && currentRepo.path === data.path) {
                        logger.debug("focus project for path:", data.path)
                        // not await
                        invoke("focus_project")
                    }
                }
                break;
            default:
                logger.warn("未处理的消息:", msg)
        }
    }

    /**
     * 发送配置通知
     */
    emit_cfg(key: string, cfgid: string | null): void {
        if (!this.isConnected || !this.client) {
            console.error('MQTT未连接，无法发送配置消息');
            return;
        }

        const message: EventBusMessage = {
            type: 'config',
            sender: softinfo.pid,
            data: { key, cfgid },
        };

        this.client.publish(
            this.channel,
            JSON.stringify(message),
            { qos: 0 },
            (err) => {
                if (err) {
                    console.error('发送配置消息失败:', err);
                } else {
                    console.log('配置消息已发送:', message);
                }
            }
        );
    }

    /**
     * 发送焦点通知
     */
    async emit_focus(focusData: Record<string, unknown>): Promise<boolean> {
        if (!this.isConnected || !this.client) {
            console.error('MQTT未连接，无法发送焦点消息');
            return false;
        }

        const message: EventBusMessage = {
            type: 'focus',
            sender: softinfo.pid,
            data: focusData,
        };

        const client = this.client;

        return new Promise<boolean>((resolve) => {
            client.publish(
                this.channel,
                JSON.stringify(message),
                { qos: 0 },
                (err) => {
                    if (err) {
                        console.error('发送焦点消息失败:', err);
                        resolve(false);
                    } else {
                        console.log('焦点消息已发送:', message);
                        resolve(true);
                    }
                }
            );

        })
    }

    /**
     * 获取连接状态
     */
    getConnectionStatus(): boolean {
        return this.isConnected;
    }

    /**
     * 断开连接
     */
    disconnect(): void {
        if (this.client) {
            this.client.end(true);
            this.client = null;
        }

        this.isConnected = false;
        this.initResolve = null;
        console.log('MQTT已断开');
    }
}

export const mqttInstance = new Mqtt();
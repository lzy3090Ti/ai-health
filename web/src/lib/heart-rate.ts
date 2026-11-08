import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';

export interface HeartRateSession {
  deviceName: string;
  stop: () => Promise<void>;
}

export function parseHeartRate(value: DataView) {
  if (!value || value.byteLength < 2) return null;
  const flags = value.getUint8(0);
  const heartRate = (flags & 0x01) === 0 ? value.getUint8(1) : value.getUint16(1, true);
  return heartRate >= 30 && heartRate <= 220 ? heartRate : null;
}

type WebBluetoothCharacteristic = {
  value?: DataView;
  startNotifications: () => Promise<void>;
  stopNotifications: () => Promise<void>;
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
};
type WebBluetoothServer = {
  disconnect: () => void;
  getPrimaryService: (service: string) => Promise<{ getCharacteristic: (name: string) => Promise<WebBluetoothCharacteristic> }>;
};
type WebBluetoothDevice = { name?: string; gatt?: { connect: () => Promise<WebBluetoothServer> } };
type BluetoothNavigator = Navigator & {
  bluetooth?: { requestDevice: (options: unknown) => Promise<WebBluetoothDevice> };
};

// 原生端（Android/iOS）只接受完整的 128 位 UUID，短 UUID '180D' 会被校验拒绝
const HEART_RATE_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HEART_RATE_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb';

function detailOf(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

async function connectDevice(deviceId: string) {
  try {
    await BleClient.connect(deviceId);
  } catch (reason) {
    // Android 首次连接常因设备还在上一轮扫描/连接状态而返回 GATT 133，稍等重试一次
    await new Promise((resolve) => setTimeout(resolve, 800));
    try {
      await BleClient.connect(deviceId);
    } catch {
      throw reason;
    }
  }
}

async function pickDevice() {
  try {
    return await BleClient.requestDevice({
      services: [HEART_RATE_SERVICE],
      optionalServices: [HEART_RATE_SERVICE],
    });
  } catch (reason) {
    const detail = detailOf(reason);
    if (/cancel|abort|user/i.test(detail)) throw new Error('已取消，未选择设备');
    throw new Error(
      `没有搜索到心率设备：${detail}。请靠近设备，并让手环/手表开启「心率广播」或运动模式；若已被手机自带健康 App 连接，请先断开`,
    );
  }
}

async function connectNative(onValue: (heartRate: number) => void): Promise<HeartRateSession> {
  // androidNeverForLocation: 只做心率读取，不用于定位，Android 12+ 无需申请定位权限
  try {
    await BleClient.initialize({ androidNeverForLocation: true });
  } catch (reason) {
    throw new Error(`蓝牙未就绪：${detailOf(reason)}。请确认已允许「附近的设备」权限并打开蓝牙`);
  }

  const device = await pickDevice();

  try {
    await connectDevice(device.deviceId);
  } catch (reason) {
    throw new Error(`连接 ${device.name || '设备'} 失败：${detailOf(reason)}。请先在其他 App 中断开该设备后重试`);
  }

  try {
    await BleClient.startNotifications(device.deviceId, HEART_RATE_SERVICE, HEART_RATE_MEASUREMENT, (value) => {
      const heartRate = parseHeartRate(value);
      if (heartRate) onValue(heartRate);
    });
  } catch (reason) {
    await BleClient.disconnect(device.deviceId).catch(() => undefined);
    throw new Error(`该设备未提供标准心率广播（0x2A37）：${detailOf(reason)}`);
  }

  return {
    deviceName: device.name || '穿戴设备',
    stop: async () => {
      await BleClient.stopNotifications(device.deviceId, HEART_RATE_SERVICE, HEART_RATE_MEASUREMENT).catch(() => undefined);
      await BleClient.disconnect(device.deviceId).catch(() => undefined);
    },
  };
}

async function connectWeb(onValue: (heartRate: number) => void): Promise<HeartRateSession> {
  const bluetooth = (navigator as BluetoothNavigator).bluetooth;
  if (!bluetooth) throw new Error('请使用支持 Web Bluetooth 的 Chrome 浏览器');
  const device = await bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
  if (!device.gatt) throw new Error('设备不支持蓝牙连接');
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService('heart_rate');
  const characteristic = await service.getCharacteristic('heart_rate_measurement');
  const listener: EventListener = (event) => {
    const heartRate = parseHeartRate((event.target as unknown as WebBluetoothCharacteristic).value as DataView);
    if (heartRate) onValue(heartRate);
  };
  characteristic.addEventListener('characteristicvaluechanged', listener);
  await characteristic.startNotifications();
  return {
    deviceName: device.name || '穿戴设备',
    stop: async () => {
      characteristic.removeEventListener('characteristicvaluechanged', listener);
      await characteristic.stopNotifications().catch(() => undefined);
      server.disconnect();
    },
  };
}

export function connectHeartRate(onValue: (heartRate: number) => void): Promise<HeartRateSession> {
  return Capacitor.isNativePlatform() ? connectNative(onValue) : connectWeb(onValue);
}

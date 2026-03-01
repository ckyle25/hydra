import { registerEvent } from "../register-event";
import type { GameShop } from "@types";
import { SelfHostedCloud } from "@main/services";

const toggleArtifactFreeze = async (
  _event: Electron.IpcMainInvokeEvent,
  objectId: string,
  shop: GameShop,
  gameArtifactId: string,
  freeze: boolean
) => {
  await SelfHostedCloud.setArtifactFrozen(objectId, shop, gameArtifactId, freeze);
  return { ok: true };
};

registerEvent("toggleArtifactFreeze", toggleArtifactFreeze);


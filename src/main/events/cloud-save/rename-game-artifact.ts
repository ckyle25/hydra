import { registerEvent } from "../register-event";
import type { GameShop } from "@types";
import { SelfHostedCloud } from "@main/services";

const renameGameArtifact = async (
  _event: Electron.IpcMainInvokeEvent,
  objectId: string,
  shop: GameShop,
  gameArtifactId: string,
  label: string
) => {
  await SelfHostedCloud.renameArtifact(objectId, shop, gameArtifactId, label);
  return { ok: true };
};

registerEvent("renameGameArtifact", renameGameArtifact);


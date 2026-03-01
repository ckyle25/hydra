import { registerEvent } from "../register-event";
import type { GameShop } from "@types";
import { SelfHostedCloud } from "@main/services";

const deleteGameArtifact = async (
  _event: Electron.IpcMainInvokeEvent,
  objectId: string,
  shop: GameShop,
  gameArtifactId: string
) => {
  await SelfHostedCloud.deleteArtifact(objectId, shop, gameArtifactId);
  return { ok: true };
};

registerEvent("deleteGameArtifact", deleteGameArtifact);


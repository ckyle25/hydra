import { registerEvent } from "../register-event";
import type { GameShop } from "@types";
import { SelfHostedCloud } from "@main/services";

const getGameArtifacts = async (
  _event: Electron.IpcMainInvokeEvent,
  objectId: string,
  shop: GameShop
) => {
  return SelfHostedCloud.listGameArtifacts(objectId, shop);
};

registerEvent("getGameArtifacts", getGameArtifacts);


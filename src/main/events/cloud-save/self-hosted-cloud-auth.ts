import { registerEvent } from "../register-event";
import { SelfHostedCloud } from "@main/services";

registerEvent("selfHostedCloudGetSession", async () => {
  const session = await SelfHostedCloud.getSession();
  return session;
});

registerEvent(
  "selfHostedCloudSignIn",
  async (_event: Electron.IpcMainInvokeEvent, username: string, password: string) => {
    return SelfHostedCloud.signIn(username, password);
  }
);

registerEvent(
  "selfHostedCloudSignUp",
  async (_event: Electron.IpcMainInvokeEvent, username: string, password: string) => {
    return SelfHostedCloud.signUp(username, password);
  }
);

registerEvent("selfHostedCloudSignOut", async () => {
  await SelfHostedCloud.signOut();
});

registerEvent("selfHostedCloudGetPathConfig", async () => {
  return SelfHostedCloud.getRootPathConfig();
});

registerEvent(
  "selfHostedCloudSetPath",
  async (_event: Electron.IpcMainInvokeEvent, pathValue: string | null) => {
    await SelfHostedCloud.setRootPath(pathValue);
    return SelfHostedCloud.getRootPathConfig();
  }
);

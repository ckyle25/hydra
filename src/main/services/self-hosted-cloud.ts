import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { app } from "electron";
import { db, levelKeys } from "@main/level";
import type { GameArtifact, GameShop, UserPreferences } from "@types";

interface SelfHostedCloudUser {
  id: string;
  username: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
}

interface SelfHostedCloudUsersFile {
  users: SelfHostedCloudUser[];
}

interface SelfHostedCloudSession {
  username: string;
  signedInAt: string;
}

interface SelfHostedCloudArtifactRecord extends GameArtifact {
  fileName: string;
  homeDir: string;
  winePrefixPath: string | null;
}

interface SelfHostedCloudArtifactsFile {
  artifacts: SelfHostedCloudArtifactRecord[];
}

const DEFAULT_BACKUPS_PER_GAME_LIMIT = 100;

export class SelfHostedCloud {
  private static sessionKey = "selfHostedCloudSession";
  private static rootPathOverride: string | null = null;

  public static isEnabled() {
    return true;
  }

  public static getBackupsPerGameLimit() {
    return DEFAULT_BACKUPS_PER_GAME_LIMIT;
  }

  public static getRootPath() {
    const configuredPath =
      this.rootPathOverride?.trim() ??
      String(
      import.meta.env.MAIN_VITE_SELF_HOSTED_CLOUD_PATH ?? ""
    ).trim();

    if (configuredPath.length > 0) {
      return configuredPath;
    }

    return path.join(app.getPath("userData"), "SelfHostedCloud");
  }

  public static async initialize() {
    const preferences = await db
      .get<string, UserPreferences | null>(levelKeys.userPreferences, {
        valueEncoding: "json",
      })
      .catch(() => null);

    this.rootPathOverride = preferences?.selfHostedCloudPath ?? null;
  }

  public static async setRootPath(pathValue: string | null) {
    const trimmedPath = pathValue?.trim() ?? "";
    this.rootPathOverride = trimmedPath.length > 0 ? trimmedPath : null;

    const preferences = await db
      .get<string, UserPreferences | null>(levelKeys.userPreferences, {
        valueEncoding: "json",
      })
      .catch(() => null);

    await db.put<string, UserPreferences>(
      levelKeys.userPreferences,
      {
        ...(preferences ?? {}),
        selfHostedCloudPath: this.rootPathOverride,
      },
      { valueEncoding: "json" }
    );
  }

  public static async getRootPathConfig() {
    const configuredPath = this.rootPathOverride?.trim() ?? "";
    return {
      path: configuredPath,
      isConfigured: configuredPath.length > 0,
      effectivePath: this.getRootPath(),
    };
  }

  private static ensureDir(dirPath: string) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  private static getAccountsFilePath() {
    return path.join(this.getRootPath(), "accounts.json");
  }

  private static getArtifactsDir(
    username: string,
    shop: GameShop,
    objectId: string
  ) {
    return path.join(this.getRootPath(), "users", username, "artifacts", shop, objectId);
  }

  private static getArtifactsFilePath(
    username: string,
    shop: GameShop,
    objectId: string
  ) {
    return path.join(this.getArtifactsDir(username, shop, objectId), "artifacts.json");
  }

  private static readUsers(): SelfHostedCloudUser[] {
    const filePath = this.getAccountsFilePath();
    this.ensureDir(path.dirname(filePath));

    if (!fs.existsSync(filePath)) {
      const empty: SelfHostedCloudUsersFile = { users: [] };
      fs.writeFileSync(filePath, JSON.stringify(empty, null, 2), "utf8");
      return [];
    }

    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as SelfHostedCloudUsersFile;
    return parsed.users ?? [];
  }

  private static writeUsers(users: SelfHostedCloudUser[]) {
    const filePath = this.getAccountsFilePath();
    this.ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify({ users }, null, 2), "utf8");
  }

  private static readArtifacts(
    username: string,
    shop: GameShop,
    objectId: string
  ): SelfHostedCloudArtifactRecord[] {
    const filePath = this.getArtifactsFilePath(username, shop, objectId);
    this.ensureDir(path.dirname(filePath));

    if (!fs.existsSync(filePath)) {
      const empty: SelfHostedCloudArtifactsFile = { artifacts: [] };
      fs.writeFileSync(filePath, JSON.stringify(empty, null, 2), "utf8");
      return [];
    }

    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as SelfHostedCloudArtifactsFile;
    return parsed.artifacts ?? [];
  }

  private static writeArtifacts(
    username: string,
    shop: GameShop,
    objectId: string,
    artifacts: SelfHostedCloudArtifactRecord[]
  ) {
    const filePath = this.getArtifactsFilePath(username, shop, objectId);
    this.ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify({ artifacts }, null, 2), "utf8");
  }

  private static hashPassword(password: string, salt: string) {
    return crypto.scryptSync(password, salt, 64).toString("hex");
  }

  private static normalizeUsername(username: string) {
    return username.trim().toLowerCase();
  }

  public static async getSession() {
    return db
      .get<string, SelfHostedCloudSession>(this.sessionKey, {
        valueEncoding: "json",
      })
      .catch(() => null);
  }

  public static async getCurrentUsername() {
    const session = await this.getSession();
    return session?.username ?? null;
  }

  private static async requireCurrentUsername() {
    const username = await this.getCurrentUsername();
    if (!username) {
      throw new Error("Not signed in to self-hosted cloud");
    }
    return username;
  }

  public static async signOut() {
    await db.del(this.sessionKey).catch(() => {});
  }

  public static async signIn(username: string, password: string) {
    const normalizedUsername = this.normalizeUsername(username);
    const users = this.readUsers();
    const user = users.find((u) => u.username === normalizedUsername);
    if (!user) {
      throw new Error("Invalid username or password");
    }

    const passwordHash = this.hashPassword(password, user.passwordSalt);
    if (passwordHash !== user.passwordHash) {
      throw new Error("Invalid username or password");
    }

    await db.put<string, SelfHostedCloudSession>(
      this.sessionKey,
      { username: normalizedUsername, signedInAt: new Date().toISOString() },
      { valueEncoding: "json" }
    );

    return { username: normalizedUsername };
  }

  public static async signUp(username: string, password: string) {
    const normalizedUsername = this.normalizeUsername(username);
    if (normalizedUsername.length < 3) {
      throw new Error("Username must be at least 3 characters");
    }

    if (password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    const users = this.readUsers();
    const exists = users.some((u) => u.username === normalizedUsername);
    if (exists) {
      throw new Error("Username already exists");
    }

    const passwordSalt = crypto.randomUUID();
    const passwordHash = this.hashPassword(password, passwordSalt);

    users.push({
      id: crypto.randomUUID(),
      username: normalizedUsername,
      passwordSalt,
      passwordHash,
      createdAt: new Date().toISOString(),
    });

    this.writeUsers(users);
    return this.signIn(normalizedUsername, password);
  }

  public static async listGameArtifacts(objectId: string, shop: GameShop) {
    const username = await this.requireCurrentUsername();
    const artifacts = this.readArtifacts(username, shop, objectId);
    return artifacts
      .slice()
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .map((artifact) => {
        const { fileName: _fileName, homeDir: _homeDir, winePrefixPath: _wp, ...rest } =
          artifact;
        return rest;
      });
  }

  public static async saveArtifact(params: {
    objectId: string;
    shop: GameShop;
    bundleLocation: string;
    artifactLengthInBytes: number;
    downloadOptionTitle: string | null;
    label: string;
    homeDir: string;
    winePrefixPath: string | null;
  }) {
    const username = await this.requireCurrentUsername();
    const { objectId, shop } = params;
    const artifacts = this.readArtifacts(username, shop, objectId);

    const id = crypto.randomUUID();
    const fileName = `${id}.tar`;
    const artifactsDir = this.getArtifactsDir(username, shop, objectId);
    this.ensureDir(artifactsDir);

    fs.copyFileSync(params.bundleLocation, path.join(artifactsDir, fileName));

    const now = new Date().toISOString();
    artifacts.push({
      id,
      artifactLengthInBytes: params.artifactLengthInBytes,
      downloadOptionTitle: params.downloadOptionTitle,
      createdAt: now,
      updatedAt: now,
      hostname: os.hostname(),
      downloadCount: 0,
      label: params.label,
      isFrozen: false,
      fileName,
      homeDir: params.homeDir,
      winePrefixPath: params.winePrefixPath,
    });

    this.writeArtifacts(username, shop, objectId, artifacts);
  }

  public static async renameArtifact(
    objectId: string,
    shop: GameShop,
    artifactId: string,
    label: string
  ) {
    const username = await this.requireCurrentUsername();
    const artifacts = this.readArtifacts(username, shop, objectId);
    const artifact = artifacts.find((a) => a.id === artifactId);
    if (!artifact) throw new Error("Artifact not found");
    artifact.label = label;
    artifact.updatedAt = new Date().toISOString();
    this.writeArtifacts(username, shop, objectId, artifacts);
  }

  public static async setArtifactFrozen(
    objectId: string,
    shop: GameShop,
    artifactId: string,
    freeze: boolean
  ) {
    const username = await this.requireCurrentUsername();
    const artifacts = this.readArtifacts(username, shop, objectId);
    const artifact = artifacts.find((a) => a.id === artifactId);
    if (!artifact) throw new Error("Artifact not found");
    artifact.isFrozen = freeze;
    artifact.updatedAt = new Date().toISOString();
    this.writeArtifacts(username, shop, objectId, artifacts);
  }

  public static async deleteArtifact(
    objectId: string,
    shop: GameShop,
    artifactId: string
  ) {
    const username = await this.requireCurrentUsername();
    const artifacts = this.readArtifacts(username, shop, objectId);
    const artifact = artifacts.find((a) => a.id === artifactId);
    if (!artifact) return;
    if (artifact.isFrozen) throw new Error("Cannot delete frozen artifact");

    const artifactFilePath = path.join(
      this.getArtifactsDir(username, shop, objectId),
      artifact.fileName
    );
    if (fs.existsSync(artifactFilePath)) {
      fs.rmSync(artifactFilePath, { force: true });
    }

    this.writeArtifacts(
      username,
      shop,
      objectId,
      artifacts.filter((a) => a.id !== artifactId)
    );
  }

  public static async getArtifactDownloadInfo(
    objectId: string,
    shop: GameShop,
    artifactId: string
  ) {
    const username = await this.requireCurrentUsername();
    const artifacts = this.readArtifacts(username, shop, objectId);
    const artifact = artifacts.find((a) => a.id === artifactId);
    if (!artifact) throw new Error("Artifact not found");

    artifact.downloadCount += 1;
    artifact.updatedAt = new Date().toISOString();
    this.writeArtifacts(username, shop, objectId, artifacts);

    return {
      artifactPath: path.join(
        this.getArtifactsDir(username, shop, objectId),
        artifact.fileName
      ),
      homeDir: artifact.homeDir,
      artifactWinePrefixPath: artifact.winePrefixPath,
    };
  }
}

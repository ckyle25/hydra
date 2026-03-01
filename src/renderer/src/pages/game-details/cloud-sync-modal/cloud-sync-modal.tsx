import { Button, Modal, ModalProps, TextField } from "@renderer/components";
import { useContext, useEffect, useMemo, useState } from "react";
import { cloudSyncContext, gameDetailsContext } from "@renderer/context";
import "./cloud-sync-modal.scss";
import { formatBytes } from "@shared";
import {
  ClockIcon,
  DeviceDesktopIcon,
  HistoryIcon,
  InfoIcon,
  PencilIcon,
  PinIcon,
  PinSlashIcon,
  SyncIcon,
  TrashIcon,
  UploadIcon,
} from "@primer/octicons-react";
import { useAppSelector, useDate, useToast } from "@renderer/hooks";
import { useTranslation } from "react-i18next";
import { AxiosProgressEvent } from "axios";
import { formatDownloadProgress } from "@renderer/helpers";
import { CloudSyncRenameArtifactModal } from "../cloud-sync-rename-artifact-modal/cloud-sync-rename-artifact-modal";
import { GameArtifact } from "@types";
import { motion, AnimatePresence } from "framer-motion";
import { orderBy } from "lodash-es";

export interface CloudSyncModalProps
  extends Omit<ModalProps, "children" | "title"> {}

const isSelfHostedCloudSaveEnabled = true;

export function CloudSyncModal({ visible, onClose }: CloudSyncModalProps) {
  const [deletingArtifact, setDeletingArtifact] = useState(false);
  const [backupDownloadProgress, setBackupDownloadProgress] =
    useState<AxiosProgressEvent | null>(null);
  const [artifactToRename, setArtifactToRename] = useState<GameArtifact | null>(
    null
  );
  const [session, setSession] = useState<{ username: string } | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const { t } = useTranslation("game_details");
  const { formatDate, formatDateTime } = useDate();

  const {
    artifacts,
    backupPreview,
    uploadingBackup,
    restoringBackup,
    loadingPreview,
    freezingArtifact,
    uploadSaveGame,
    downloadGameArtifact,
    deleteGameArtifact,
    toggleArtifactFreeze,
    setShowCloudSyncFilesModal,
    getGameBackupPreview,
    getGameArtifacts,
  } = useContext(cloudSyncContext);

  const { objectId, shop, gameTitle, game, lastDownloadedOption } =
    useContext(gameDetailsContext);

  const { showSuccessToast, showErrorToast } = useToast();

  const refreshSession = async () => {
    if (!isSelfHostedCloudSaveEnabled) return;
    const currentSession = await window.electron.selfHostedCloudGetSession();
    setSession(currentSession ? { username: currentSession.username } : null);
  };

  const handleCloudAuth = async () => {
    if (!username.trim() || !password) return;

    setAuthLoading(true);
    try {
      if (isCreatingAccount) {
        await window.electron.selfHostedCloudSignUp(username, password);
      } else {
        await window.electron.selfHostedCloudSignIn(username, password);
      }

      setPassword("");
      await refreshSession();
      await getGameBackupPreview();
      await getGameArtifacts();
    } catch (err) {
      showErrorToast("Cloud account authentication failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCloudSignOut = async () => {
    await window.electron.selfHostedCloudSignOut();
    setSession(null);
    await getGameArtifacts();
  };

  const handleDeleteArtifactClick = async (gameArtifactId: string) => {
    setDeletingArtifact(true);
    try {
      await deleteGameArtifact(gameArtifactId);
      showSuccessToast(t("backup_deleted"));
    } catch (err) {
      showErrorToast("backup_deletion_failed");
    } finally {
      setDeletingArtifact(false);
    }
  };

  useEffect(() => {
    const removeBackupDownloadProgressListener =
      window.electron.onBackupDownloadProgress(
        objectId!,
        shop,
        (progressEvent) => {
          setBackupDownloadProgress(progressEvent);
        }
      );
    return () => {
      removeBackupDownloadProgressListener();
    };
  }, [backupPreview, objectId, shop]);

  const handleBackupInstallClick = async (artifactId: string) => {
    setBackupDownloadProgress(null);
    downloadGameArtifact(artifactId);
  };

  const handleFreezeArtifactClick = async (
    artifactId: string,
    isFrozen: boolean
  ) => {
    try {
      await toggleArtifactFreeze(artifactId, isFrozen);
      showSuccessToast(isFrozen ? t("backup_frozen") : t("backup_unfrozen"));
    } catch (err) {
      showErrorToast(
        t("backup_freeze_failed"),
        t("backup_freeze_failed_description")
      );
    }
  };

  useEffect(() => {
    if (visible) {
      refreshSession();
      getGameBackupPreview();
    }
  }, [getGameBackupPreview, visible]);

  const userDetails = useAppSelector((state) => state.userDetails.userDetails);
  const backupsPerGameLimit =
    userDetails?.quirks?.backupsPerGameLimit ??
    (isSelfHostedCloudSaveEnabled ? 100 : 0);

  const backupStateLabel = useMemo(() => {
    if (uploadingBackup) {
      return (
        <span className="cloud-sync-modal__backup-state-label">
          <SyncIcon className="cloud-sync-modal__sync-icon" />
          {t("uploading_backup")}
        </span>
      );
    }
    if (restoringBackup) {
      return (
        <span className="cloud-sync-modal__backup-state-label">
          <SyncIcon className="cloud-sync-modal__sync-icon" />
          {t("restoring_backup", {
            progress: formatDownloadProgress(
              backupDownloadProgress?.progress ?? 0
            ),
          })}
        </span>
      );
    }
    if (loadingPreview) {
      return (
        <span className="cloud-sync-modal__backup-state-label">
          <SyncIcon className="cloud-sync-modal__sync-icon" />
          {t("loading_save_preview")}
        </span>
      );
    }
    if (artifacts.length >= backupsPerGameLimit) {
      return t("max_number_of_artifacts_reached");
    }
    if (!backupPreview) {
      return t("no_backup_preview");
    }
    if (artifacts.length === 0) {
      return t("no_backups");
    }
    return "";
  }, [
    uploadingBackup,
    backupDownloadProgress?.progress,
    backupPreview,
    restoringBackup,
    loadingPreview,
    artifacts,
    backupsPerGameLimit,
    t,
  ]);

  const isSelfHostedAuthenticated = !isSelfHostedCloudSaveEnabled || !!session;

  const disableActions =
    !isSelfHostedAuthenticated ||
    uploadingBackup || restoringBackup || deletingArtifact || freezingArtifact;
  const isMissingWinePrefix =
    window.electron.platform === "linux" && !game?.winePrefixPath;

  return (
    <>
      <CloudSyncRenameArtifactModal
        visible={!!artifactToRename}
        onClose={() => setArtifactToRename(null)}
        artifact={artifactToRename}
      />

      <Modal
        visible={visible}
        title={t("cloud_save")}
        description={t("cloud_save_description")}
        onClose={onClose}
        large
      >
        {isSelfHostedCloudSaveEnabled && !session && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ marginBottom: 8 }}>
              Sign in to your self-hosted cloud account to manage saves.
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <TextField
                value={username}
                placeholder="Username"
                onChange={(event) => setUsername(event.target.value)}
              />
              <TextField
                value={password}
                placeholder="Password"
                type="password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button onClick={handleCloudAuth} disabled={authLoading}>
                {isCreatingAccount ? "Create account" : "Sign in"}
              </Button>
              <Button
                theme="outline"
                onClick={() => setIsCreatingAccount((current) => !current)}
              >
                {isCreatingAccount
                  ? "I already have an account"
                  : "Create new account"}
              </Button>
            </div>
          </div>
        )}
        {isSelfHostedCloudSaveEnabled && session && (
          <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
            <small>Signed in as {session.username}</small>
            <Button theme="outline" onClick={handleCloudSignOut}>
              Sign out
            </Button>
          </div>
        )}
        <div className="cloud-sync-modal__header">
          <div className="cloud-sync-modal__title-container">
            <h2>{gameTitle}</h2>
            <p>{backupStateLabel}</p>
            <button
              type="button"
              className="cloud-sync-modal__manage-files-button"
              onClick={() => setShowCloudSyncFilesModal(true)}
              disabled={disableActions}
            >
              {t("manage_files")}
            </button>
          </div>

          <Button
            type="button"
            onClick={() => uploadSaveGame(lastDownloadedOption?.title ?? null)}
            tooltip={isMissingWinePrefix ? t("missing_wine_prefix") : undefined}
            tooltipPlace="left"
            disabled={
              disableActions ||
              !backupPreview?.overall.totalGames ||
              artifacts.length >= backupsPerGameLimit ||
              isMissingWinePrefix
            }
          >
            {uploadingBackup ? (
              <SyncIcon className="cloud-sync-modal__sync-icon" />
            ) : (
              <UploadIcon />
            )}
            {t("create_backup")}
          </Button>
        </div>

        <div className="cloud-sync-modal__backups-header">
          <h2>{t("backups")}</h2>
          <small>
            {artifacts.length} / {backupsPerGameLimit}
          </small>
        </div>

        {artifacts.length > 0 ? (
          <ul className="cloud-sync-modal__artifacts">
            <AnimatePresence>
              {orderBy(artifacts, [(a) => !a.isFrozen], ["asc"]).map(
                (artifact) => (
                  <motion.li
                    key={artifact.id}
                    className="cloud-sync-modal__artifact"
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="cloud-sync-modal__artifact-info">
                      <div className="cloud-sync-modal__artifact-header">
                        <button
                          type="button"
                          className="cloud-sync-modal__artifact-label"
                          onClick={() => setArtifactToRename(artifact)}
                        >
                          {artifact.label ??
                            t("backup_from", {
                              date: formatDate(artifact.createdAt),
                            })}
                          <PencilIcon />
                        </button>
                        <small>
                          {formatBytes(artifact.artifactLengthInBytes)}
                        </small>
                      </div>

                      <span className="cloud-sync-modal__artifact-meta">
                        <DeviceDesktopIcon size={14} />
                        {artifact.hostname}
                      </span>

                      <span className="cloud-sync-modal__artifact-meta">
                        <InfoIcon size={14} />
                        {artifact.downloadOptionTitle ??
                          t("no_download_option_info")}
                      </span>

                      <span className="cloud-sync-modal__artifact-meta">
                        <ClockIcon size={14} />
                        {formatDateTime(artifact.createdAt)}
                      </span>
                    </div>

                    <div className="cloud-sync-modal__artifact-actions">
                      <Button
                        type="button"
                        tooltip={
                          artifact.isFrozen
                            ? t("unfreeze_backup")
                            : t("freeze_backup")
                        }
                        theme={artifact.isFrozen ? "primary" : "outline"}
                        onClick={() =>
                          handleFreezeArtifactClick(
                            artifact.id,
                            !artifact.isFrozen
                          )
                        }
                        disabled={disableActions}
                      >
                        {artifact.isFrozen ? <PinSlashIcon /> : <PinIcon />}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => handleBackupInstallClick(artifact.id)}
                        disabled={disableActions}
                        theme="outline"
                      >
                        {restoringBackup ? (
                          <SyncIcon className="cloud-sync-modal__sync-icon" />
                        ) : (
                          <HistoryIcon />
                        )}
                        {t("install_backup")}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => handleDeleteArtifactClick(artifact.id)}
                        disabled={disableActions || artifact.isFrozen}
                        theme="outline"
                        tooltip={t("delete_backup")}
                      >
                        <TrashIcon />
                      </Button>
                    </div>
                  </motion.li>
                )
              )}
            </AnimatePresence>
          </ul>
        ) : (
          <p>{t("no_backups_created")}</p>
        )}
      </Modal>
    </>
  );
}

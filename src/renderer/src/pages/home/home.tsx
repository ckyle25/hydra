import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { levelDBService } from "@renderer/services/leveldb.service";
import { Button } from "@renderer/components";
import { useAppSelector, useDate, useLibrary, useUserDetails } from "@renderer/hooks";
import { buildGameDetailsPath } from "@renderer/helpers";
import { AuthPage } from "@shared";
import type { LibraryGame } from "@types";
import { PlayIcon, ClockIcon, DownloadIcon, PulseIcon } from "@primer/octicons-react";
import "./home.scss";

type SelfHostedStatus = {
  signedIn: boolean;
  username: string | null;
  pathConfigured: boolean;
  effectivePath: string | null;
  downloadSources: number;
};

export default function Home() {
  const { t } = useTranslation("home");
  const navigate = useNavigate();
  const { formatDistance } = useDate();
  const { library, updateLibrary } = useLibrary();
  const { userDetails } = useUserDetails();
  const { gameRunning } = useAppSelector((state) => state.gameRunning);

  const [isRefreshingLibrary, setIsRefreshingLibrary] = useState(false);
  const [selfHostedStatus, setSelfHostedStatus] = useState<SelfHostedStatus>({
    signedIn: false,
    username: null,
    pathConfigured: false,
    effectivePath: null,
    downloadSources: 0,
  });

  useEffect(() => {
    const loadStatus = async () => {
      const [session, pathConfig, sources] = await Promise.all([
        window.electron.selfHostedCloudGetSession().catch(() => null),
        window.electron.selfHostedCloudGetPathConfig().catch(() => null),
        levelDBService.values("downloadSources").catch(() => []),
      ]);

      setSelfHostedStatus({
        signedIn: Boolean(session?.username),
        username: session?.username ?? null,
        pathConfigured: Boolean(pathConfig?.isConfigured),
        effectivePath: pathConfig?.effectivePath ?? null,
        downloadSources: (sources as unknown[]).length,
      });
    };

    loadStatus();
  }, []);

  const sortedRecentGames = useMemo(() => {
    return [...library]
      .filter((game) => game.lastTimePlayed)
      .sort(
        (a, b) =>
          new Date(b.lastTimePlayed as Date).getTime() -
          new Date(a.lastTimePlayed as Date).getTime()
      );
  }, [library]);

  const currentlyRunningGame = useMemo(() => {
    if (!gameRunning) return null;
    return library.find((game) => game.id === gameRunning.id) ?? null;
  }, [gameRunning, library]);

  const continueGame = (currentlyRunningGame ?? sortedRecentGames[0]) as
    | LibraryGame
    | undefined;
  const isSignedIn = Boolean(userDetails?.id);

  const recentActivity = useMemo(() => sortedRecentGames.slice(0, 5), [sortedRecentGames]);

  const dashboardStats = useMemo(() => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const totalPlaytimeHours = library.reduce(
      (acc, game) => acc + (game.playTimeInMilliseconds ?? 0),
      0
    );

    const playedThisWeek = library.filter((game) => {
      if (!game.lastTimePlayed) return false;
      return new Date(game.lastTimePlayed).getTime() >= sevenDaysAgo;
    }).length;

    const favorites = library.filter((game) => Boolean(game.favorite)).length;
    const activeDownloads = library.filter((game) => {
      const status = game.download?.status;
      return status === "active" || game.download?.queued;
    }).length;

    const cloudSyncEnabled = library.filter((game) => game.automaticCloudSync).length;

    return {
      libraryCount: library.length,
      playedThisWeek,
      favorites,
      activeDownloads,
      cloudSyncEnabled,
      totalPlaytimeHours: totalPlaytimeHours / 1000 / 60 / 60,
    };
  }, [library]);

  const whatsNext = useMemo(() => {
    const neverPlayedInstalled = library.find(
      (game) => game.executablePath && !game.lastTimePlayed
    );
    const favoriteNotRecentlyPlayed = library
      .filter((game) => game.favorite && game.lastTimePlayed)
      .sort(
        (a, b) =>
          new Date(a.lastTimePlayed as Date).getTime() -
          new Date(b.lastTimePlayed as Date).getTime()
      )[0];
    const downloading = library.find(
      (game) => game.download?.status === "active" || game.download?.queued
    );

    return [
      neverPlayedInstalled
        ? {
            label: t("launch_installed_game", {
              defaultValue: "Try {{title}} (installed, not played yet)",
              title: neverPlayedInstalled.title,
            }),
            game: neverPlayedInstalled,
          }
        : null,
      favoriteNotRecentlyPlayed
        ? {
            label: t("revisit_favorite", {
              defaultValue: "Revisit favorite: {{title}}",
              title: favoriteNotRecentlyPlayed.title,
            }),
            game: favoriteNotRecentlyPlayed,
          }
        : null,
      downloading
        ? {
            label: t("check_download_progress", {
              defaultValue: "Check download progress: {{title}}",
              title: downloading.title,
            }),
            game: downloading,
          }
        : null,
    ].filter(Boolean) as { label: string; game: LibraryGame }[];
  }, [library, t]);

  const handleRefreshLibrary = async () => {
    setIsRefreshingLibrary(true);
    try {
      await updateLibrary();
    } finally {
      setIsRefreshingLibrary(false);
    }
  };

  const handlePlayContinueGame = async () => {
    if (!continueGame?.executablePath) return;

    await window.electron.openGame(
      continueGame.shop,
      continueGame.objectId,
      continueGame.executablePath,
      continueGame.launchOptions
    );
  };

  const handleOpenContinueGameFolder = async () => {
    if (!continueGame) return;
    await window.electron.openGameExecutablePath(
      continueGame.shop,
      continueGame.objectId
    );
  };

  const heroSuggestion = whatsNext[0]?.game ?? continueGame;
  const heroImage =
    heroSuggestion?.customHeroImageUrl ??
    heroSuggestion?.libraryHeroImageUrl ??
    heroSuggestion?.customLogoImageUrl ??
    heroSuggestion?.logoImageUrl ??
    heroSuggestion?.libraryImageUrl ??
    heroSuggestion?.coverImageUrl ??
    null;

  return (
    <section className="home__content">
      <section className="home__next-hero">
        {heroImage && (
          <img
            src={heroImage}
            alt={heroSuggestion?.title ?? "Suggested game"}
            className="home__next-hero-image"
          />
        )}
        <div className="home__next-hero-overlay" />
        <div className="home__next-hero-content">
          <small>{t("up_next", { defaultValue: "Up Next" })}</small>
          <h2>
            {heroSuggestion?.title ??
              t("pick_your_next_game", { defaultValue: "Pick your next game" })}
          </h2>
          <p>
            {whatsNext[0]?.label ??
              t("build_library_to_get_suggestions", {
                defaultValue: "Launch and organize more games to get smarter suggestions.",
              })}
          </p>
          {heroSuggestion && (
            <div className="home__next-hero-actions">
              <Button
                onClick={() => navigate(buildGameDetailsPath(heroSuggestion))}
              >
                {t("open_details", { defaultValue: "Open Details" })}
              </Button>
              {heroSuggestion.executablePath && (
                <Button
                  theme="outline"
                  onClick={() =>
                    window.electron.openGame(
                      heroSuggestion.shop,
                      heroSuggestion.objectId,
                      heroSuggestion.executablePath!,
                      heroSuggestion.launchOptions
                    )
                  }
                >
                  <PlayIcon />
                  {t("play_now", { defaultValue: "Play Now" })}
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="home__session-banner">
        <span
          className={`home__session-pill ${isSignedIn ? "is-online" : "is-offline"}`}
        >
          {isSignedIn
            ? t("account_connected", { defaultValue: "Account connected" })
            : t("local_mode", { defaultValue: "Offline / Local Data Mode" })}
        </span>
        <p>
          {isSignedIn
            ? t("account_connected_description", {
                defaultValue:
                  "Cloud profile features are available. Library and playtime are still read from local storage.",
              })
            : t("local_mode_description", {
                defaultValue:
                  "You are signed out. Home stats are local and still available, but cloud profile features are disabled.",
              })}
        </p>
        {!isSignedIn && (
          <Button
            theme="outline"
            onClick={() => window.electron.openAuthWindow(AuthPage.SignIn)}
          >
            {t("sign_in", { defaultValue: "Sign In" })}
          </Button>
        )}
      </section>

      <section className="home__dashboard">
        <article className="home__panel home__panel--continue">
          <div className="home__panel-header">
            <h2>{t("continue_playing", { defaultValue: "Continue Playing" })}</h2>
            {userDetails?.displayName && (
              <small>
                {t("welcome_back", {
                  defaultValue: "Welcome back, {{name}}",
                  name: userDetails.displayName,
                })}
              </small>
            )}
          </div>

          {continueGame ? (
            <div className="home__continue-content">
              <div className="home__continue-meta">
                <h3>{continueGame.title}</h3>
                <p>
                  {continueGame.lastTimePlayed
                    ? t("last_played_time", {
                        defaultValue: "Last played {{time}}",
                        time: formatDistance(new Date(continueGame.lastTimePlayed), new Date(), {
                          addSuffix: true,
                        }),
                      })
                    : t("ready_to_launch", {
                        defaultValue: "Ready to launch",
                      })}
                </p>
              </div>

              <div className="home__continue-actions">
                <Button
                  onClick={handlePlayContinueGame}
                  disabled={!continueGame.executablePath}
                >
                  <PlayIcon />
                  {t("play_now", { defaultValue: "Play Now" })}
                </Button>
                <Button
                  theme="outline"
                  onClick={() => navigate(buildGameDetailsPath(continueGame))}
                >
                  {t("open_details", { defaultValue: "Open Details" })}
                </Button>
                <Button
                  theme="outline"
                  onClick={handleOpenContinueGameFolder}
                  disabled={!continueGame.executablePath}
                >
                  {t("open_folder", { defaultValue: "Open Folder" })}
                </Button>
              </div>
            </div>
          ) : (
            <p className="home__empty-text">
              {t("no_recent_sessions", {
                defaultValue: "No recent sessions yet. Launch a game to get started.",
              })}
            </p>
          )}
        </article>

        <article className="home__panel">
          <div className="home__panel-header">
            <h2>{t("stats_snapshot", { defaultValue: "Stats Snapshot" })}</h2>
          </div>
          {!isSignedIn && (
            <small className="home__context-note">
              {t("local_stats_note", {
                defaultValue: "Showing local stats while signed out.",
              })}
            </small>
          )}

          <div className="home__stats-grid">
            <div className="home__stat-item">
              <span>{t("games_total", { defaultValue: "Games" })}</span>
              <strong>{dashboardStats.libraryCount}</strong>
            </div>
            <div className="home__stat-item">
              <span>{t("hours_total", { defaultValue: "Playtime (h)" })}</span>
              <strong>{dashboardStats.totalPlaytimeHours.toFixed(1)}</strong>
            </div>
            <div className="home__stat-item">
              <span>{t("played_this_week", { defaultValue: "Played This Week" })}</span>
              <strong>{dashboardStats.playedThisWeek}</strong>
            </div>
            <div className="home__stat-item">
              <span>{t("favorites", { defaultValue: "Favorites" })}</span>
              <strong>{dashboardStats.favorites}</strong>
            </div>
          </div>
        </article>

        <article className="home__panel">
          <div className="home__panel-header">
            <h2>{t("quick_actions", { defaultValue: "Quick Actions" })}</h2>
          </div>

          <div className="home__quick-actions">
            <Button theme="outline" onClick={() => navigate("/library")}>
              <ClockIcon />
              {t("open_library", { defaultValue: "Open Library" })}
            </Button>
            <Button theme="outline" onClick={() => navigate("/downloads")}>
              <DownloadIcon />
              {t("open_downloads", { defaultValue: "Open Downloads" })}
            </Button>
            <Button
              theme="outline"
              onClick={handleRefreshLibrary}
              disabled={isRefreshingLibrary}
            >
              {isRefreshingLibrary
                ? t("refreshing", { defaultValue: "Refreshing..." })
                : t("refresh_library", { defaultValue: "Refresh Library" })}
            </Button>
            {userDetails?.id && (
              <Button theme="outline" onClick={() => navigate(`/profile/${userDetails.id}`)}>
                {t("open_profile", { defaultValue: "Open Profile" })}
              </Button>
            )}
          </div>
        </article>

        <article className="home__panel">
          <div className="home__panel-header">
            <h2>{t("self_hosted_health", { defaultValue: "Self-Hosted Health" })}</h2>
          </div>
          <ul className="home__health-list">
            <li>
              <span>{t("cloud_session", { defaultValue: "Cloud Session" })}</span>
              <strong>{selfHostedStatus.signedIn ? "Connected" : "Not connected"}</strong>
            </li>
            <li>
              <span>{t("cloud_user", { defaultValue: "Cloud User" })}</span>
              <strong>{selfHostedStatus.username ?? "-"}</strong>
            </li>
            <li>
              <span>{t("storage_path", { defaultValue: "Storage Path" })}</span>
              <strong>{selfHostedStatus.pathConfigured ? "Configured" : "Not configured"}</strong>
            </li>
            <li>
              <span>{t("download_sources", { defaultValue: "Download Sources" })}</span>
              <strong>{selfHostedStatus.downloadSources}</strong>
            </li>
          </ul>
        </article>

        <article className="home__panel">
          <div className="home__panel-header">
            <h2>{t("cloud_backup_status", { defaultValue: "Cloud / Backup Status" })}</h2>
          </div>
          <ul className="home__health-list">
            <li>
              <span>{t("cloud_sync_enabled_games", { defaultValue: "Cloud Sync Enabled" })}</span>
              <strong>{dashboardStats.cloudSyncEnabled}</strong>
            </li>
            <li>
              <span>{t("active_downloads", { defaultValue: "Active Downloads" })}</span>
              <strong>{dashboardStats.activeDownloads}</strong>
            </li>
            <li>
              <span>{t("recently_played_count", { defaultValue: "Recently Played" })}</span>
              <strong>{recentActivity.length}</strong>
            </li>
            <li>
              <span>{t("effective_storage", { defaultValue: "Effective Storage" })}</span>
              <strong title={selfHostedStatus.effectivePath ?? ""}>
                {selfHostedStatus.effectivePath ? "Available" : "Unavailable"}
              </strong>
            </li>
          </ul>
        </article>

        <article className="home__panel">
          <div className="home__panel-header">
            <h2>{t("whats_next", { defaultValue: "What's Next" })}</h2>
          </div>
          {whatsNext.length > 0 ? (
            <ul className="home__activity-list">
              {whatsNext.map((item) => (
                <li
                  key={item.game.id}
                  className="home__activity-item"
                  onClick={() => navigate(buildGameDetailsPath(item.game))}
                >
                  <span>{item.label}</span>
                  <PulseIcon />
                </li>
              ))}
            </ul>
          ) : (
            <p className="home__empty-text">
              {t("nothing_suggested", {
                defaultValue: "No suggestions yet. Add and launch a few games first.",
              })}
            </p>
          )}
        </article>

        <article className="home__panel home__panel--wide">
          <div className="home__panel-header">
            <h2>{t("recent_activity", { defaultValue: "Recent Activity" })}</h2>
          </div>
          {recentActivity.length > 0 ? (
            <ul className="home__activity-list">
              {recentActivity.map((game) => (
                <li
                  key={game.id}
                  className="home__activity-item"
                  onClick={() => navigate(buildGameDetailsPath(game))}
                >
                  <span>{game.title}</span>
                  <small>
                    {game.lastTimePlayed
                      ? formatDistance(new Date(game.lastTimePlayed), new Date(), {
                          addSuffix: true,
                        })
                      : "-"}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="home__empty-text">
              {t("no_activity_yet", { defaultValue: "No activity yet" })}
            </p>
          )}
        </article>
      </section>
    </section>
  );
}

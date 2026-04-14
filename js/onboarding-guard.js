/**
 * First-time users must complete onboarding (or skip). Redirects before the app shell renders.
 * Existing local data migrates to a minimal profile so current users are not blocked.
 */
(function () {
  try {
    var PROFILE_KEY = "interval_user_profile_v1";
    if (localStorage.getItem(PROFILE_KEY)) return;

    var legacy =
      localStorage.getItem("interval_session_calendar_v1") ||
      localStorage.getItem("interval_guide_goals_v1") ||
      localStorage.getItem("interval_session_events_v1");

    if (legacy) {
      localStorage.setItem(
        PROFILE_KEY,
        JSON.stringify({
          version: 1,
          skipped: true,
          migrated: true,
          createdAt: new Date().toISOString(),
        })
      );
      return;
    }

    var path = (location.pathname.split("/").pop() || "").toLowerCase();
    if (path === "onboarding.html") return;

    location.replace("onboarding.html");
  } catch (e) {}
})();

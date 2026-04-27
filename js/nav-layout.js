/**
 * Nav layout — hamburger toggle for left-nav drawer (mobile) and top-nav collapse (mobile).
 * Reads data-nav-layout from <html>; the inline script on each page sets it before render.
 */
(function () {
  "use strict";

var HAMBURGER_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">' +
  '<rect x="3" y="5" width="18" height="2.5"/>' +
  '<rect x="3" y="11" width="18" height="2.5"/>' +
  '<rect x="3" y="17" width="18" height="2.5"/>' +
  "</svg>";

  function isTopNav() {
    return document.documentElement.getAttribute("data-nav-layout") === "top";
  }

  function makeBurger() {
    var btn = document.createElement("button");
    btn.className = "mobile-nav-toggle";
    btn.setAttribute("aria-label", "Toggle navigation");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("type", "button");
    btn.innerHTML = HAMBURGER_SVG;
    return btn;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var sidebar = document.querySelector(".sidebar");
    if (!sidebar) return;

    var topNav = isTopNav();
    var overlay = null;

    if (!topNav) {
      overlay = document.createElement("div");
      overlay.className = "sidebar-overlay";
      overlay.setAttribute("aria-hidden", "true");
      document.body.appendChild(overlay);
    }

    var btn = makeBurger();

    if (topNav) {
      var navEl = sidebar.querySelector(".sidebar__nav");
      sidebar.insertBefore(btn, navEl);
    } else {
      var header = document.querySelector(".main__header");
      if (header) {
        header.insertBefore(btn, header.firstChild);
      }
    }

    function openSidebar() {
      sidebar.classList.add("sidebar--open");
      btn.setAttribute("aria-expanded", "true");
      if (overlay) {
        overlay.classList.add("sidebar-overlay--open");
        document.body.style.overflow = "hidden";
      }
    }

    function closeSidebar() {
      sidebar.classList.remove("sidebar--open");
      btn.setAttribute("aria-expanded", "false");
      if (overlay) {
        overlay.classList.remove("sidebar-overlay--open");
        document.body.style.overflow = "";
      }
    }

    btn.addEventListener("click", function () {
      sidebar.classList.contains("sidebar--open") ? closeSidebar() : openSidebar();
    });

    if (overlay) {
      overlay.addEventListener("click", closeSidebar);
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && sidebar.classList.contains("sidebar--open")) {
        closeSidebar();
        btn.focus();
      }
    });

    var links = sidebar.querySelectorAll(".sidebar__link");
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener("click", function () {
        if (window.innerWidth <= 640 && sidebar.classList.contains("sidebar--open")) {
          closeSidebar();
        }
      });
    }

    window.addEventListener("resize", function () {
      if (window.innerWidth > 640 && sidebar.classList.contains("sidebar--open")) {
        closeSidebar();
      }
    });
  });
})();

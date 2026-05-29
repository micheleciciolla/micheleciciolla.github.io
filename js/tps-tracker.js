/*
    Leica TPS 3D tracking
    ---------------------
    A fixed total station on the left edge keeps a laser locked on a prism
    that travels down the blue Work-Experience timeline as the page scrolls.
    Pure vanilla JS, driven by requestAnimationFrame. No dependencies.
*/
(function () {
    "use strict";

    var STATION_VB = { w: 96, h: 132 }; // station svg viewBox
    var PIVOT = { x: 48, y: 33 };       // trunnion axis in svg units
    var LENS_DIST = 42;                 // pivot -> objective lens (svg units)
    var MOBILE_BP = 900;
    var NEAR_PX = 34;                   // distance to "lock" a marker

    var wrap, station, stationSvg, head, prism, beam, beamGlow, hit;
    var icons = [], firstIcon, lastIcon, expSection, eduSection;
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var ticking = false;

    function $(id) { return document.getElementById(id); }

    function collect() {
        icons = Array.prototype.slice.call(
            document.querySelectorAll("#experience-timeline .vtimeline-icon")
        );
        firstIcon = icons[0];
        lastIcon = icons[icons.length - 1];
        expSection = $("experience");
        // first #education block is "University Education"
        eduSection = document.querySelector("#education");
    }

    // center of an element in document coordinates
    function centerDoc(el) {
        var r = el.getBoundingClientRect();
        return {
            x: r.left + window.pageXOffset + r.width / 2,
            y: r.top + window.pageYOffset + r.height / 2
        };
    }

    function isMobile() { return window.innerWidth <= MOBILE_BP; }

    function update() {
        ticking = false;
        if (!firstIcon || !lastIcon || !expSection) return;

        var vh = window.innerHeight;
        var scrollY = window.pageYOffset;

        // Show the rig only while Work Experience holds focus:
        //  - START once the section's top rises into the upper third of the
        //    viewport (the About "I'm all about diving" block has scrolled off)
        //  - END once University Education scrolls into focus
        var exp = expSection.getBoundingClientRect();
        var expFocused = exp.top < vh * 0.6 && exp.bottom > 0;
        var eduFocused = eduSection && eduSection.getBoundingClientRect().top < vh * 0.45;
        var visible = expFocused && !eduFocused;
        wrap.classList.toggle("tps-active", visible);
        if (!visible) return;

        var first = centerDoc(firstIcon);
        var last = centerDoc(lastIcon);
        var lineX = first.x; // blue line x (markers are centered on it)

        // progress: where the viewport centre sits between first and last marker
        var viewCenter = scrollY + vh / 2;
        var span = (last.y - first.y) || 1;
        var p = (viewCenter - first.y) / span;
        if (p < 0) p = 0; else if (p > 1) p = 1;

        // on mobile, park the prism on the first marker (no scroll tracking)
        var prismDocY = isMobile() ? first.y : first.y + p * span;

        var prismX = lineX - window.pageXOffset;
        var prismY = prismDocY - scrollY;
        prism.style.transform = "translate(" + prismX + "px," + prismY + "px)";

        // station pivot in viewport coords
        var sRect = station.getBoundingClientRect();
        var scale = sRect.width / STATION_VB.w;
        var pivotX = sRect.left + PIVOT.x * scale;
        var pivotY = sRect.top + PIVOT.y * scale;

        // aim
        var dx = prismX - pivotX;
        var dy = prismY - pivotY;
        var ang = Math.atan2(dy, dx);          // radians
        var deg = ang * 180 / Math.PI;

        head.setAttribute("transform", "rotate(" + deg.toFixed(2) + " " + PIVOT.x + " " + PIVOT.y + ")");

        // laser leaves the objective lens, travels to the prism
        var lensX = pivotX + Math.cos(ang) * LENS_DIST * scale;
        var lensY = pivotY + Math.sin(ang) * LENS_DIST * scale;

        beam.setAttribute("x1", lensX); beam.setAttribute("y1", lensY);
        beam.setAttribute("x2", prismX); beam.setAttribute("y2", prismY);
        beamGlow.setAttribute("x1", lensX); beamGlow.setAttribute("y1", lensY);
        beamGlow.setAttribute("x2", prismX); beamGlow.setAttribute("y2", prismY);

        hit.setAttribute("cx", prismX);
        hit.setAttribute("cy", prismY);
        hit.setAttribute("r", 3);

        // light up the marker the prism is currently over
        var pageY = prismDocY;
        for (var i = 0; i < icons.length; i++) {
            var c = centerDoc(icons[i]);
            icons[i].classList.toggle("tps-locked", Math.abs(c.y - pageY) < NEAR_PX);
        }
    }

    function requestUpdate() {
        if (!ticking) {
            ticking = true;
            window.requestAnimationFrame(update);
        }
    }

    // --- gentle scroll-reveal across the page (part of the refresh) ---
    function setupReveal() {
        if (reduceMotion || !("IntersectionObserver" in window)) return;
        var targets = document.querySelectorAll(
            "#about .about-image, #about .about-content p, " +
            ".vtimeline-point, .education-block, .project, #skills ul, #contact h2"
        );
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    e.target.classList.add("tps-in");
                    io.unobserve(e.target);
                }
            });
        }, { threshold: 0.12 });
        Array.prototype.forEach.call(targets, function (el) {
            el.classList.add("tps-reveal");
            io.observe(el);
        });
    }

    function init() {
        wrap = $("tps-tracker");
        station = $("tps-station");
        stationSvg = $("tps-station-svg");
        head = $("tps-head");
        prism = $("tracking-prism");
        beam = $("tps-beam");
        beamGlow = $("tps-beam-glow");
        hit = $("tps-hit");
        if (!wrap || !station || !head || !prism) return;

        collect();
        setupReveal();
        update();

        window.addEventListener("scroll", requestUpdate, { passive: true });
        window.addEventListener("resize", function () { collect(); requestUpdate(); });
    }

    // timeline DOM is built by scripts.min.js on load, so wait for it
    if (document.readyState === "complete") {
        init();
    } else {
        window.addEventListener("load", init);
    }
})();

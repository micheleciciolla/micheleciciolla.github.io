/*
    Leica TPS 3D tracking
    ---------------------
    A fixed total station on the left edge keeps a laser locked on a prism
    that travels down the blue Work-Experience timeline as the page scrolls.
    Pure vanilla JS, driven by requestAnimationFrame. No dependencies.
*/
(function () {
    "use strict";

    // laser origin = telescope objective on tps.png, as a fraction of the image
    // (image is 284x670; lens centre ~ (140, 55))
    var LENS_FX = 0.49;
    var LENS_FY = 0.082;
    var MOBILE_BP = 900;
    var NEAR_PX = 34;                   // distance to "lock" a marker

    var wrap, station, stationImg, prism, beam, beamGlow, emitter, hit;
    var aboutSection, paverTrack, paverPaved, paverMachine;
    var uniSection, uniCircuit, uniTraces = [], uniNodes = [], uniFormulas = [], uniBots = [];
    var coursesSection, studyItems = [];
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
        aboutSection = $("about");

        uniSection = document.querySelector(".uni-edu");
        uniCircuit = $("uni-circuit");
        uniTraces = Array.prototype.slice.call(document.querySelectorAll("#uni-traces path"));
        uniNodes = Array.prototype.slice.call(document.querySelectorAll("#uni-nodes circle"));
        uniFormulas = Array.prototype.slice.call(document.querySelectorAll(".uni-formula"));
        uniBots = Array.prototype.slice.call(document.querySelectorAll(".uni-bot")).map(function (el) {
            return { el: el, path: uniTraces[+el.getAttribute("data-path") || 0] };
        });
        // prime each trace for the draw-on (dash = full length, fully hidden)
        for (var t = 0; t < uniTraces.length; t++) {
            var L = uniTraces[t].getTotalLength();
            uniTraces[t]._len = L;
            uniTraces[t].style.strokeDasharray = L;
            uniTraces[t].style.strokeDashoffset = L;
        }

        coursesSection = document.querySelector(".courses-fx-host");
        studyItems = Array.prototype.slice.call(document.querySelectorAll(".study-item")).map(function (el) {
            return {
                el: el,
                rot: parseFloat(el.getAttribute("data-rot")) || 0,
                kx: parseFloat(el.getAttribute("data-kx")) || 0,
                ky: parseFloat(el.getAttribute("data-ky")) || 0,
                spin: parseFloat(el.getAttribute("data-spin")) || 0
            };
        });
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

    // drive the paver across its track as the About section scrolls past
    function updatePaver() {
        if (!aboutSection || !paverTrack || !paverMachine) return;
        var r = aboutSection.getBoundingClientRect();
        var vh = window.innerHeight;
        // 0 when the section's top reaches viewport centre, 1 when its bottom does
        var span = (r.height) || 1;
        var p = (vh * 0.5 - r.top) / span;
        if (p < 0) p = 0; else if (p > 1) p = 1;

        var travel = paverTrack.clientWidth - paverMachine.clientWidth;
        var x = p * travel;
        paverMachine.style.transform = "translateX(" + x + "px)";
        // pave up to the machine's middle
        paverPaved.style.width = (x + paverMachine.clientWidth * 0.5) + "px";
    }

    // University Education: draw circuits, light nodes, "write" formulas with scroll
    function updateUni() {
        if (!uniSection) return;
        var r = uniSection.getBoundingClientRect();
        var vh = window.innerHeight;
        var p = (vh - r.top) / (vh + r.height);
        if (p < 0) p = 0; else if (p > 1) p = 1;

        for (var i = 0; i < uniTraces.length; i++) {
            var L = uniTraces[i]._len || uniTraces[i].getTotalLength();
            uniTraces[i].style.strokeDashoffset = L * (1 - p);
        }

        // line-follower robots ride their trace at the drawing front
        if (uniCircuit) {
            // viewBox is 0..1000; SVG is stretched (preserveAspectRatio none)
            var sx = uniCircuit.clientWidth / 1000, sy = uniCircuit.clientHeight / 1000;
            for (var b = 0; b < uniBots.length; b++) {
                var pa = uniBots[b].path;
                if (!pa) continue;
                var len = pa._len || pa.getTotalLength();
                var d = p * len;
                var c = pa.getPointAtLength(d);
                var c2 = pa.getPointAtLength(Math.min(len, d + 2));
                // convert to pixels (anisotropic scale) for position and heading
                var px = c.x * sx, py = c.y * sy;
                var ang = Math.atan2((c2.y - c.y) * sy, (c2.x - c.x) * sx) * 180 / Math.PI;
                uniBots[b].el.style.transform =
                    "translate(" + px + "px," + py + "px) translate(-50%,-50%) rotate(" + (ang + 90) + "deg)";
            }
        }
        for (var n = 0; n < uniNodes.length; n++) {
            uniNodes[n].classList.toggle("on", p > (n + 1) / (uniNodes.length + 2));
        }
        var N = uniFormulas.length;
        for (var f = 0; f < N; f++) {
            var start = f / N, end = (f + 0.85) / N;
            var fp = (p - start) / (end - start);
            if (fp < 0) fp = 0; else if (fp > 1) fp = 1;
            var inset = "inset(0 " + ((1 - fp) * 100).toFixed(1) + "% 0 0)";
            uniFormulas[f].style.webkitClipPath = inset;
            uniFormulas[f].style.clipPath = inset;
            uniFormulas[f].classList.toggle("writing", fp > 0.01 && fp < 0.99);
        }
    }

    // Courses & Certifications: parallax-drift the study props as the section scrolls
    function updateCourses() {
        if (!coursesSection || !studyItems.length) return;
        var r = coursesSection.getBoundingClientRect();
        var vh = window.innerHeight;
        var p = (vh - r.top) / (vh + r.height);
        if (p < 0) p = 0; else if (p > 1) p = 1;
        var c = p - 0.5; // -0.5 .. 0.5
        for (var i = 0; i < studyItems.length; i++) {
            var it = studyItems[i];
            it.el.style.transform =
                "translate(" + (c * it.kx).toFixed(1) + "px," + (c * it.ky).toFixed(1) + "px) " +
                "rotate(" + (it.rot + c * it.spin).toFixed(1) + "deg)";
        }
    }

    function update() {
        ticking = false;
        updatePaver();
        updateUni();
        updateCourses();
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

        // laser origin = telescope lens on the station photo, in viewport coords
        var sRect = (stationImg || station).getBoundingClientRect();
        var lensX = sRect.left + LENS_FX * sRect.width;
        var lensY = sRect.top + LENS_FY * sRect.height;

        // beam travels from the lens to the prism
        beam.setAttribute("x1", lensX); beam.setAttribute("y1", lensY);
        beam.setAttribute("x2", prismX); beam.setAttribute("y2", prismY);
        beamGlow.setAttribute("x1", lensX); beamGlow.setAttribute("y1", lensY);
        beamGlow.setAttribute("x2", prismX); beamGlow.setAttribute("y2", prismY);

        emitter.setAttribute("cx", lensX);
        emitter.setAttribute("cy", lensY);
        emitter.setAttribute("r", 4);

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
        stationImg = $("tps-station-img");
        prism = $("tracking-prism");
        paverTrack = $("paver-track");
        paverPaved = $("paver-paved");
        paverMachine = $("paver-machine");
        beam = $("tps-beam");
        beamGlow = $("tps-beam-glow");
        emitter = $("tps-emitter");
        hit = $("tps-hit");
        if (!wrap || !station || !prism) return;

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

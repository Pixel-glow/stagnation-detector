import React, { useState, useMemo, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Cell
} from "recharts";
import Papa from "papaparse";

// ─── CONSTANTS ─────────────────────────────────────────────────────────────────

const MAX_VIDEOS = 50;

const FORMAT_OPTIONS = [
  "Tutorial / How-to",
  "Screen Recording Walkthrough",
  "Beginner's Guide / Starter Pack",
  "Project Build",
  "Talking Head Commentary",
  "Podcast-style Conversation",
  "Vlog (Video Blog)",
  "Storytime / Personal Experience",
  "Listicle (Top List)",
  "Before vs After Transformation",
  "Review / Unboxing",
  "Product Review (Short Format)",
  "Commentary on Trends / News",
  "Interview / Q&A",
  "Voiceover with B-roll",
  "Reaction",
  "Things I Wish I Knew",
  "Challenge",
  "Music / Performance",
  "Myth vs Fact / Debunking",
  "Comedy / Sketch",
  "Behind-the-Scenes Process",
  "Live Stream",
  "Documentary Style",
  "Comparison Video (A vs B)",
  "Other",
];

// Auto-suggest based on title keywords — creator always overrides
const FORMAT_HINTS = {
  "tutorial": "Tutorial / How-to", "how to": "Tutorial / How-to", "guide": "Tutorial / How-to",
  "explained": "Tutorial / How-to", "step by step": "Tutorial / How-to",
  "beginner": "Beginner's Guide / Starter Pack", "starter": "Beginner's Guide / Starter Pack",
  "basics": "Beginner's Guide / Starter Pack", "getting started": "Beginner's Guide / Starter Pack",
  "project": "Project Build", "build": "Project Build", "create": "Project Build",
  "automate": "Project Build", "made a": "Project Build", "built a": "Project Build",
  "talking head": "Talking Head Commentary",
  "podcast": "Podcast-style Conversation", "conversation with": "Podcast-style Conversation",
  "vlog": "Vlog (Video Blog)", "day in": "Vlog (Video Blog)", "a day": "Vlog (Video Blog)",
  "my morning": "Vlog (Video Blog)", "come with me": "Vlog (Video Blog)",
  "storytime": "Storytime / Personal Experience", "story time": "Storytime / Personal Experience",
  "my experience": "Storytime / Personal Experience", "what happened": "Storytime / Personal Experience",
  "i tried": "Challenge", "challenge": "Challenge", "i did": "Challenge",
  "top": "Listicle (Top List)", "best": "Listicle (Top List)", "worst": "Listicle (Top List)",
  "tips": "Listicle (Top List)", "things you": "Listicle (Top List)",
  "before and after": "Before vs After Transformation", "transformation": "Before vs After Transformation",
  "glow up": "Before vs After Transformation",
  "review": "Review / Unboxing", "unboxing": "Review / Unboxing", "honest": "Review / Unboxing",
  "worth it": "Review / Unboxing",
  "product review": "Product Review (Short Format)",
  "news": "Commentary on Trends / News", "drama": "Commentary on Trends / News",
  "update": "Commentary on Trends / News", "opinion": "Commentary on Trends / News",
  "interview": "Interview / Q&A", "q&a": "Interview / Q&A", "qa": "Interview / Q&A",
  "ask me": "Interview / Q&A",
  "react": "Reaction", "reacting": "Reaction", "reaction": "Reaction",
  "wish i knew": "Things I Wish I Knew", "things i": "Things I Wish I Knew",
  "mistakes": "Things I Wish I Knew",
  "music": "Music / Performance", "cover": "Music / Performance", "performance": "Music / Performance",
  "myth": "Myth vs Fact / Debunking", "debunk": "Myth vs Fact / Debunking",
  "fact or": "Myth vs Fact / Debunking", "actually": "Myth vs Fact / Debunking",
  "comedy": "Comedy / Sketch", "sketch": "Comedy / Sketch", "funny": "Comedy / Sketch",
  "skit": "Comedy / Sketch",
  "behind the scenes": "Behind-the-Scenes Process", "bts": "Behind-the-Scenes Process",
  "process": "Behind-the-Scenes Process", "how i make": "Behind-the-Scenes Process",
  "live": "Live Stream", "livestream": "Live Stream", "stream": "Live Stream",
  "documentary": "Documentary Style", "deep dive": "Documentary Style",
  "the story of": "Documentary Style",
  "vs": "Comparison Video (A vs B)", "compared": "Comparison Video (A vs B)",
  "which is better": "Comparison Video (A vs B)",
  "screen recording": "Screen Recording Walkthrough", "walkthrough": "Screen Recording Walkthrough",
};

function guessFormat(title) {
  const lower = title.toLowerCase();
  for (const [keyword, format] of Object.entries(FORMAT_HINTS)) {
    if (lower.includes(keyword)) return format;
  }
  return "Other";
}

// ─── DATA PROCESSING ENGINE ────────────────────────────────────────────────────

function processCreatorData(videos) {
  const sorted = [...videos].slice(-MAX_VIDEOS);
  const total = sorted.length;
  if (total < 4) return null;

  const half = Math.floor(total / 2);
  const firstHalf = sorted.slice(0, half);
  const secondHalf = sorted.slice(half);

  const avg = (arr, key) => {
    const valid = arr.filter(v => v[key] != null && !isNaN(v[key]));
    return valid.length ? valid.reduce((s, v) => s + v[key], 0) / valid.length : 0;
  };

  const viewsTrend = avg(firstHalf, "views") > 0
    ? ((avg(secondHalf, "views") - avg(firstHalf, "views")) / avg(firstHalf, "views") * 100) : 0;
  const retTrend = avg(firstHalf, "retention") > 0
    ? ((avg(secondHalf, "retention") - avg(firstHalf, "retention")) / avg(firstHalf, "retention") * 100) : 0;
  const ctrTrend = avg(firstHalf, "ctr") > 0
    ? ((avg(secondHalf, "ctr") - avg(firstHalf, "ctr")) / avg(firstHalf, "ctr") * 100) : 0;

  // Stagnation score on 0–10 scale
  const raw = (Math.min(0, viewsTrend) * 0.4 + Math.min(0, retTrend) * 0.4 + Math.min(0, ctrTrend) * 0.2);
  const risk100 = Math.min(100, Math.max(0, Math.abs(raw) * 2.2));
  // Invert: 10 = healthy, 0 = critical
  const healthScore = +((10 - (risk100 / 10))).toFixed(1);
  const churn = Math.min(95, Math.round(risk100 * 0.7 + 5));

  // Format analysis
  const formatMap = {};
  sorted.forEach((v, i) => {
    const fmt = v.format;
    if (!formatMap[fmt]) formatMap[fmt] = { views: [], retention: [], count: 0, firstHalfRet: [], secondHalfRet: [] };
    formatMap[fmt].views.push(v.views || 0);
    formatMap[fmt].retention.push(v.retention || 0);
    formatMap[fmt].count++;
    if (i < half) formatMap[fmt].firstHalfRet.push(v.retention || 0);
    else formatMap[fmt].secondHalfRet.push(v.retention || 0);
  });

  const formats = Object.entries(formatMap).map(([name, data]) => {
    const avgViews = Math.round(data.views.reduce((a, b) => a + b, 0) / data.views.length);
    const avgRet = +(data.retention.reduce((a, b) => a + b, 0) / data.retention.length).toFixed(1);
    const fhRet = data.firstHalfRet.length ? data.firstHalfRet.reduce((a, b) => a + b, 0) / data.firstHalfRet.length : avgRet;
    const shRet = data.secondHalfRet.length ? data.secondHalfRet.reduce((a, b) => a + b, 0) / data.secondHalfRet.length : avgRet;
    const trend = fhRet > 0 ? Math.round((shRet - fhRet) / fhRet * 100) : 0;
    return { name, views: avgViews, retention: avgRet, count: data.count, trend };
  }).sort((a, b) => b.retention - a.retention);

  // Weekly aggregation
  const weeksCount = Math.min(12, Math.ceil(total / 1));
  const perWeek = Math.max(1, Math.floor(total / weeksCount));
  const weeklyData = [];
  for (let w = 0; w < weeksCount; w++) {
    const slice = sorted.slice(w * perWeek, (w + 1) * perWeek);
    if (slice.length === 0) break;
    weeklyData.push({
      week: `W${w + 1}`,
      views: Math.round(avg(slice, "views")),
      retention: +avg(slice, "retention").toFixed(1),
    });
  }

  const growingFormats = formats.filter(f => f.trend > 5);
  const decliningFormats = formats.filter(f => f.trend < -5);
  const bestFormat = formats[0];
  const worstFormat = formats[formats.length - 1];

  // Strategy generation
  const strategy = {
    format: {
      do: growingFormats.length > 0
        ? `${growingFormats.map(f => f.name).join(" and ")} content (avg ${growingFormats[0]?.retention}% retention)`
        : "Experiment with new formats — no clear winner yet",
      stop: decliningFormats.length > 0
        ? `${decliningFormats.map(f => f.name).join(" and ")} content (avg ${decliningFormats[0]?.retention}% retention, declining)`
        : "No formats critically declining — maintain current mix",
      ratio: growingFormats.length > 0
        ? `${Math.min(70, 40 + growingFormats.length * 15)}% ${growingFormats[0]?.name} · ${Math.max(10, 30 - growingFormats.length * 10)}% experimental · ${Math.max(10, 30 - decliningFormats.length * 10)}% other`
        : "Split evenly across formats until clear signals emerge",
    },
    positioning: {
      current: decliningFormats.length > 0 ? `Heavy ${decliningFormats[0]?.name} focus` : "Mixed content approach",
      pivot: growingFormats.length > 0
        ? `Lean into ${growingFormats[0]?.name} — your audience responds ${Math.round((growingFormats[0]?.retention / (decliningFormats[0]?.retention || 40)) * 100 - 100)}% better to this format`
        : "Test 3 different formats over next month to find signal",
      hook: "Lead with your highest-retention format and topic combination",
    },
    frequency: {
      current: `${Math.round(total / 12)} videos/month average`,
      recommended: healthScore < 5
        ? "Reduce to 1/week — invest more time per video in your winning format"
        : "Maintain current pace — focus on format mix rather than volume",
      reason: "Higher production quality in winning formats beats volume in declining ones",
    },
    calendar: [
      { wk: "Week 1", format: bestFormat?.name || "Best format", title: `Create a ${bestFormat?.name || "high-retention"} video on your most-requested topic`, why: `${bestFormat?.name} has your highest retention at ${bestFormat?.retention}%` },
      { wk: "Week 2", format: growingFormats[1]?.name || "Challenge / Story", title: "Personal story or challenge — share a real experience with your audience", why: "Story-driven content typically drives 1.5–2x retention over instructional" },
      { wk: "Week 3", format: bestFormat?.name || "Best format", title: `Another ${bestFormat?.name || "top"} video — build momentum in your winning format`, why: "Consistency in a growing format signals the algorithm to push more" },
      { wk: "Week 4", format: "Review / Opinion", title: "Roundup or honest review relevant to your niche", why: "Opinion content builds authority and drives comments" },
    ],
    impact: {
      viewLift: healthScore < 5 ? "20–40%" : "10–20%",
      retTarget: `${Math.round(Math.max(bestFormat?.retention || 50, avg(sorted, "retention") + 10))}%+ average`,
      subGrowth: healthScore < 5 ? "Reverse decline in 3–4 weeks" : "Steady growth, +10–15%",
    },
  };

  return {
    videos: sorted,
    metrics: {
      healthScore,
      churn,
      vt: +viewsTrend.toFixed(1),
      rt: +retTrend.toFixed(1),
      ct: +ctrTrend.toFixed(1),
      avgViews: Math.round(avg(secondHalf, "views")),
      avgRet: +avg(secondHalf, "retention").toFixed(1),
      avgCtr: +avg(secondHalf, "ctr").toFixed(1),
    },
    formats, weeklyData, strategy, bestFormat, worstFormat, growingFormats, decliningFormats,
  };
}

// ─── DEMO DATA ─────────────────────────────────────────────────────────────────

const DEMO_VIDEOS = [
  { title: "Python Basics: Variables Explained", views: 24100, retention: 48, ctr: 5.8, format: "Tutorial / How-to" },
  { title: "How to Install Python in 2025", views: 31200, retention: 42, ctr: 5.5, format: "Screen Recording Walkthrough" },
  { title: "5 Beginner Python Mistakes", views: 19800, retention: 55, ctr: 6.1, format: "Listicle (Top List)" },
  { title: "Python For Loops Tutorial", views: 15600, retention: 38, ctr: 5.2, format: "Tutorial / How-to" },
  { title: "I Built an App in 24 Hours", views: 41200, retention: 64, ctr: 7.2, format: "Challenge" },
  { title: "Python Lists & Dictionaries", views: 12400, retention: 35, ctr: 4.8, format: "Tutorial / How-to" },
  { title: "Build a Budget Tracker in Python", views: 38500, retention: 61, ctr: 6.8, format: "Project Build" },
  { title: "Python String Methods Guide", views: 9800, retention: 32, ctr: 4.5, format: "Screen Recording Walkthrough" },
  { title: "Automate Your Desktop with Python", views: 44600, retention: 67, ctr: 7.5, format: "Project Build" },
  { title: "Python Functions for Beginners", views: 8200, retention: 30, ctr: 4.2, format: "Beginner's Guide / Starter Pack" },
  { title: "I Automated My Job with Python", views: 52100, retention: 71, ctr: 8.1, format: "Storytime / Personal Experience" },
  { title: "Build a Web Scraper Project", views: 47300, retention: 69, ctr: 7.8, format: "Project Build" },
];

// ─── PPTX GENERATION ───────────────────────────────────────────────────────────

async function generateDeck(data, channelName) {
  if (!window.PptxGenJS) {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js";
    document.head.appendChild(script);
    await new Promise((res, rej) => { script.onload = res; script.onerror = rej; });
  }

  const pptx = new window.PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = `Content Strategy — ${channelName}`;

  const colors = ["3b5765", "58727a", "58906e", "8c9d7a", "bebf87", "e9dccf"];
  const bk = "1a1a1a"; const mt = "444444"; const wh = "ffffff";
  const hs = data.metrics.healthScore;
  const riskLabel = hs >= 8 ? "HEALTHY" : hs >= 5 ? "EARLY WARNING" : hs >= 3 ? "STAGNATING" : "CRITICAL";
  const riskColor = hs >= 8 ? "22c55e" : hs >= 5 ? "f59e0b" : hs >= 3 ? "f97316" : "ef4444";

  // SLIDE 1
  let s1 = pptx.addSlide(); s1.background = { color: colors[0] };
  s1.addText("CONTENT STRATEGY AUDIT", { x: 0.8, y: 0.4, w: 5, h: 0.4, fontSize: 10, bold: true, color: "d0d0d0", fontFace: "HK Grotesk" });
  s1.addText("Channel Pulse Check", { x: 0.8, y: 0.8, w: 9, h: 0.9, fontSize: 38, bold: true, color: wh, fontFace: "Guilda Display" });
  s1.addText(`${channelName}  ·  ${new Date().toLocaleDateString()}  ·  ${data.videos.length} videos analyzed`, { x: 0.8, y: 1.65, w: 10, h: 0.35, fontSize: 13, color: "c0c0c0", fontFace: "HK Grotesk" });
  s1.addShape(pptx.shapes.RECTANGLE, { x: 0.8, y: 2.1, w: 11.7, h: 0.01, fill: { color: wh } });

  s1.addShape(pptx.shapes.RECTANGLE, { x: 0.8, y: 2.5, w: 3.5, h: 2.6, fill: { color: "2f4754" } });
  s1.addText("CHANNEL HEALTH SCORE", { x: 1.1, y: 2.7, w: 3, h: 0.3, fontSize: 10, bold: true, color: "c0c0c0", fontFace: "HK Grotesk" });
  s1.addText(`${hs}`, { x: 1.1, y: 3.0, w: 1.8, h: 0.9, fontSize: 60, bold: true, color: wh, fontFace: "Guilda Display" });
  s1.addText("/ 10", { x: 2.5, y: 3.45, w: 1.2, h: 0.35, fontSize: 18, color: "c0c0c0", fontFace: "HK Grotesk" });
  s1.addShape(pptx.shapes.RECTANGLE, { x: 1.1, y: 4.1, w: 1.8, h: 0.32, fill: { color: riskColor } });
  s1.addText(riskLabel, { x: 1.1, y: 4.1, w: 1.8, h: 0.32, fontSize: 10, bold: true, color: wh, align: "center", fontFace: "HK Grotesk" });

  const kpis = [["CHURN RISK (60-DAY)", `${data.metrics.churn}%`], ["VIEWS TREND", `${data.metrics.vt > 0 ? "+" : ""}${data.metrics.vt}%`], ["RETENTION TREND", `${data.metrics.rt > 0 ? "+" : ""}${data.metrics.rt}%`], ["CTR TREND", `${data.metrics.ct > 0 ? "+" : ""}${data.metrics.ct}%`]];
  kpis.forEach(([label, value], i) => {
    const x = 4.8 + (i % 2) * 3.6; const y = 2.5 + Math.floor(i / 2) * 1.4;
    s1.addShape(pptx.shapes.RECTANGLE, { x, y, w: 3.2, h: 1.15, fill: { color: "2f4754" } });
    s1.addText(label, { x: x + 0.25, y: y + 0.15, w: 2.8, h: 0.25, fontSize: 9, bold: true, color: "c0c0c0", fontFace: "HK Grotesk" });
    s1.addText(value, { x: x + 0.25, y: y + 0.45, w: 2.8, h: 0.5, fontSize: 26, bold: true, color: value.includes("-") ? "ef6565" : "6ee7b7", fontFace: "Guilda Display" });
  });
  s1.addText("This analysis is data-driven, not professional consulting advice. Actual results will vary.", { x: 0.8, y: 6.8, w: 11.7, h: 0.35, fontSize: 9, color: "8a8a8a", italic: true, fontFace: "HK Grotesk" });

  // SLIDE 2
  let s2 = pptx.addSlide(); s2.background = { color: colors[1] };
  s2.addText("CONTENT GAP ANALYSIS", { x: 0.8, y: 0.4, w: 5, h: 0.4, fontSize: 10, bold: true, color: "d0d0d0", fontFace: "HK Grotesk" });
  s2.addText("What's Working vs\nWhat's Declining", { x: 0.8, y: 0.8, w: 9, h: 1.1, fontSize: 34, bold: true, color: wh, fontFace: "Guilda Display" });
  s2.addText("GROWING FORMATS", { x: 0.8, y: 2.2, w: 8, h: 0.35, fontSize: 12, bold: true, color: "6ee7b7", fontFace: "HK Grotesk" });
  (data.growingFormats.length > 0 ? data.growingFormats : [{ name: "No clear growth signal", retention: "—", trend: "—" }]).slice(0, 4).forEach((f, i) => {
    const y = 2.65 + i * 0.42;
    s2.addShape(pptx.shapes.RECTANGLE, { x: 0.8, y, w: 11.7, h: 0.36, fill: { color: "486a72" } });
    s2.addText(f.name, { x: 1.0, y: y + 0.01, w: 4, h: 0.34, fontSize: 12, color: wh, fontFace: "HK Grotesk" });
    s2.addText(`Retention: ${f.retention}%  ·  Trend: +${f.trend}%`, { x: 5.5, y: y + 0.01, w: 6, h: 0.34, fontSize: 11, color: "6ee7b7", fontFace: "HK Grotesk" });
  });
  const dy = 2.65 + Math.max(data.growingFormats.length, 1) * 0.42 + 0.35;
  s2.addText("DECLINING FORMATS", { x: 0.8, y: dy, w: 8, h: 0.35, fontSize: 12, bold: true, color: "ef6565", fontFace: "HK Grotesk" });
  (data.decliningFormats.length > 0 ? data.decliningFormats : [{ name: "No formats critically declining", retention: "—", trend: "—" }]).slice(0, 4).forEach((f, i) => {
    const y = dy + 0.4 + i * 0.42;
    s2.addShape(pptx.shapes.RECTANGLE, { x: 0.8, y, w: 11.7, h: 0.36, fill: { color: "4d5a5e" } });
    s2.addText(f.name, { x: 1.0, y: y + 0.01, w: 4, h: 0.34, fontSize: 12, color: "d0d0d0", fontFace: "HK Grotesk" });
    s2.addText(`Retention: ${f.retention}%  ·  Trend: ${f.trend}%`, { x: 5.5, y: y + 0.01, w: 6, h: 0.34, fontSize: 11, color: "ef6565", fontFace: "HK Grotesk" });
  });

  // SLIDE 3
  let s3 = pptx.addSlide(); s3.background = { color: colors[2] };
  s3.addText("FORMAT BREAKDOWN", { x: 0.8, y: 0.4, w: 5, h: 0.4, fontSize: 10, bold: true, color: bk, fontFace: "HK Grotesk" });
  s3.addText("Performance by Content Type", { x: 0.8, y: 0.8, w: 9, h: 0.7, fontSize: 34, bold: true, color: bk, fontFace: "Guilda Display" });
  s3.addShape(pptx.shapes.RECTANGLE, { x: 0.8, y: 1.7, w: 11.7, h: 0.36, fill: { color: "3e6e52" } });
  s3.addText("FORMAT", { x: 1.0, y: 1.72, w: 3, h: 0.32, fontSize: 10, bold: true, color: "d0d0d0", fontFace: "HK Grotesk" });
  s3.addText("AVG RETENTION", { x: 4.5, y: 1.72, w: 2, h: 0.32, fontSize: 10, bold: true, color: "d0d0d0", fontFace: "HK Grotesk" });
  s3.addText("AVG VIEWS", { x: 7.0, y: 1.72, w: 2, h: 0.32, fontSize: 10, bold: true, color: "d0d0d0", fontFace: "HK Grotesk" });
  s3.addText("TREND", { x: 9.5, y: 1.72, w: 2, h: 0.32, fontSize: 10, bold: true, color: "d0d0d0", fontFace: "HK Grotesk" });
  data.formats.slice(0, 7).forEach((f, i) => {
    const y = 2.15 + i * 0.4;
    s3.addShape(pptx.shapes.RECTANGLE, { x: 0.8, y, w: 11.7, h: 0.36, fill: { color: i % 2 === 0 ? "4a7a5c" : "527a64" } });
    s3.addText(f.name, { x: 1.0, y: y + 0.01, w: 3, h: 0.34, fontSize: 12, color: bk, fontFace: "HK Grotesk" });
    s3.addText(`${f.retention}%`, { x: 4.5, y: y + 0.01, w: 2, h: 0.34, fontSize: 12, bold: true, color: bk, fontFace: "HK Grotesk" });
    s3.addText(`${(f.views / 1000).toFixed(1)}K`, { x: 7.0, y: y + 0.01, w: 2, h: 0.34, fontSize: 12, color: bk, fontFace: "HK Grotesk" });
    s3.addText(`${f.trend > 0 ? "+" : ""}${f.trend}%`, { x: 9.5, y: y + 0.01, w: 2, h: 0.34, fontSize: 12, bold: true, color: f.trend > 5 ? "1a4a30" : f.trend < -5 ? "6a2a2a" : bk, fontFace: "HK Grotesk" });
  });
  const ry = 2.15 + Math.min(data.formats.length, 7) * 0.4 + 0.3;
  s3.addShape(pptx.shapes.RECTANGLE, { x: 0.8, y: ry, w: 11.7, h: 1.6, fill: { color: "3e6e52" } });
  s3.addText("RECOMMENDATION", { x: 1.1, y: ry + 0.1, w: 5, h: 0.25, fontSize: 10, bold: true, color: bk, fontFace: "HK Grotesk" });
  s3.addText([{ text: "START:  ", options: { bold: true, color: "1a4a30", fontSize: 12, fontFace: "HK Grotesk" } }, { text: data.strategy.format.do, options: { color: bk, fontSize: 12, fontFace: "HK Grotesk" } }], { x: 1.1, y: ry + 0.4, w: 10, h: 0.32 });
  s3.addText([{ text: "STOP:  ", options: { bold: true, color: "6a2a2a", fontSize: 12, fontFace: "HK Grotesk" } }, { text: data.strategy.format.stop, options: { color: bk, fontSize: 12, fontFace: "HK Grotesk" } }], { x: 1.1, y: ry + 0.78, w: 10, h: 0.32 });
  s3.addText([{ text: "TARGET RATIO:  ", options: { bold: true, color: bk, fontSize: 12, fontFace: "HK Grotesk" } }, { text: data.strategy.format.ratio, options: { color: bk, fontSize: 12, fontFace: "HK Grotesk" } }], { x: 1.1, y: ry + 1.16, w: 10, h: 0.32 });

  // SLIDE 4
  let s4 = pptx.addSlide(); s4.background = { color: colors[3] };
  s4.addText("MISSED OPPORTUNITIES", { x: 0.8, y: 0.4, w: 5, h: 0.4, fontSize: 10, bold: true, color: bk, fontFace: "HK Grotesk" });
  s4.addText("Where To Focus Next", { x: 0.8, y: 0.8, w: 9, h: 0.7, fontSize: 34, bold: true, color: bk, fontFace: "Guilda Display" });
  s4.addText("Based on format and retention trends. Validate with free tools before committing.", { x: 0.8, y: 1.55, w: 10, h: 0.35, fontSize: 12, color: mt, fontFace: "HK Grotesk" });
  const opps = data.growingFormats.length > 0 ? data.growingFormats.map(f => `More ${f.name} content (${f.retention}% retention, trending +${f.trend}%)`) : ["Experiment with project-based content", "Try story/challenge format", "Test review/opinion videos"];
  opps.slice(0, 4).forEach((o, i) => {
    const y = 2.2 + i * 0.65;
    s4.addShape(pptx.shapes.RECTANGLE, { x: 0.8, y, w: 11.7, h: 0.52, fill: { color: i % 2 === 0 ? "7a8a6a" : "808f70" } });
    s4.addText(`0${i + 1}`, { x: 1.1, y: y + 0.05, w: 0.5, h: 0.4, fontSize: 18, bold: true, color: bk, fontFace: "Guilda Display" });
    s4.addText(o, { x: 1.7, y: y + 0.07, w: 9, h: 0.38, fontSize: 13, color: bk, fontFace: "HK Grotesk" });
  });
  s4.addShape(pptx.shapes.RECTANGLE, { x: 0.8, y: 5.2, w: 11.7, h: 0.65, fill: { color: "7a8a6a" } });
  s4.addText("FREE VALIDATION TOOLS", { x: 1.1, y: 5.25, w: 5, h: 0.22, fontSize: 9, bold: true, color: bk, fontFace: "HK Grotesk" });
  s4.addText("Google Trends  ·  YouTube Search Suggest  ·  vidIQ (free)  ·  TubeBuddy (free)", { x: 1.1, y: 5.52, w: 10, h: 0.28, fontSize: 11, color: mt, fontFace: "HK Grotesk" });

  // SLIDE 5
  let s5 = pptx.addSlide(); s5.background = { color: colors[4] };
  s5.addText("4-WEEK ACTION PLAN", { x: 0.8, y: 0.4, w: 5, h: 0.4, fontSize: 10, bold: true, color: bk, fontFace: "HK Grotesk" });
  s5.addText("Your Content Calendar", { x: 0.8, y: 0.8, w: 9, h: 0.7, fontSize: 34, bold: true, color: bk, fontFace: "Guilda Display" });
  s5.addText("Suggested starting points — not guarantees. Adapt based on your expertise.", { x: 0.8, y: 1.5, w: 10, h: 0.35, fontSize: 11, color: mt, italic: true, fontFace: "HK Grotesk" });
  data.strategy.calendar.forEach((item, i) => {
    const x = 0.8 + (i % 2) * 6.1; const y = 2.1 + Math.floor(i / 2) * 2.3;
    s5.addShape(pptx.shapes.RECTANGLE, { x, y, w: 5.7, h: 1.95, fill: { color: "a8a972" } });
    s5.addShape(pptx.shapes.RECTANGLE, { x: x + 0.2, y: y + 0.2, w: 1.0, h: 0.28, fill: { color: bk } });
    s5.addText(item.wk.toUpperCase(), { x: x + 0.2, y: y + 0.2, w: 1.0, h: 0.28, fontSize: 9, bold: true, color: wh, align: "center", fontFace: "HK Grotesk" });
    s5.addShape(pptx.shapes.RECTANGLE, { x: x + 1.35, y: y + 0.2, w: 1.3, h: 0.28, fill: { color: "888960" } });
    s5.addText(item.format.toUpperCase(), { x: x + 1.35, y: y + 0.2, w: 1.3, h: 0.28, fontSize: 8, bold: true, color: bk, align: "center", fontFace: "HK Grotesk" });
    s5.addText(item.title, { x: x + 0.2, y: y + 0.7, w: 5.2, h: 0.7, fontSize: 14, bold: true, color: bk, fontFace: "Guilda Display" });
    s5.addText(item.why, { x: x + 0.2, y: y + 1.45, w: 5.2, h: 0.4, fontSize: 10, color: mt, fontFace: "HK Grotesk" });
  });

  // SLIDE 6
  let s6 = pptx.addSlide(); s6.background = { color: colors[5] };
  s6.addText("PROJECTED IMPACT", { x: 0.8, y: 0.4, w: 5, h: 0.4, fontSize: 10, bold: true, color: bk, fontFace: "HK Grotesk" });
  s6.addText("What To Expect", { x: 0.8, y: 0.8, w: 9, h: 0.7, fontSize: 34, bold: true, color: bk, fontFace: "Guilda Display" });
  s6.addText("Directional estimates, not predictions. Based on your historical format performance.", { x: 0.8, y: 1.5, w: 10, h: 0.35, fontSize: 11, color: mt, italic: true, fontFace: "HK Grotesk" });
  [["EXPECTED VIEW LIFT", data.strategy.impact.viewLift, "Based on format performance"], ["RETENTION TARGET", data.strategy.impact.retTarget, "Achievable by shifting formats"], ["SUBSCRIBER GROWTH", data.strategy.impact.subGrowth, "Projected based on trends"]].forEach(([l, v, d], i) => {
    const x = 0.8 + i * 4.1;
    s6.addShape(pptx.shapes.RECTANGLE, { x, y: 2.2, w: 3.7, h: 1.7, fill: { color: "d9ccbf" } });
    s6.addText(l, { x: x + 0.3, y: 2.35, w: 3.2, h: 0.22, fontSize: 9, bold: true, color: mt, fontFace: "HK Grotesk" });
    s6.addText(v, { x: x + 0.3, y: 2.65, w: 3.2, h: 0.5, fontSize: 18, bold: true, color: bk, fontFace: "Guilda Display" });
    s6.addText(d, { x: x + 0.3, y: 3.3, w: 3.2, h: 0.4, fontSize: 10, color: mt, fontFace: "HK Grotesk" });
  });
  s6.addShape(pptx.shapes.RECTANGLE, { x: 0.8, y: 4.5, w: 11.7, h: 1.1, fill: { color: "d9ccbf" } });
  s6.addText("NEXT STEPS", { x: 1.1, y: 4.6, w: 5, h: 0.22, fontSize: 10, bold: true, color: bk, fontFace: "HK Grotesk" });
  s6.addText("1. Start with Week 1 — validate the topic with YouTube Search Suggest\n2. Track retention and views weekly in YouTube Studio\n3. Re-run this audit in 4 weeks to measure improvement", { x: 1.1, y: 4.9, w: 10, h: 0.65, fontSize: 11, color: mt, fontFace: "HK Grotesk" });

  pptx.writeFile({ fileName: `Strategy_${channelName.replace(/\s+/g, "_")}.pptx` });
}

// ─── UI HELPERS ────────────────────────────────────────────────────────────────

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1a1a2e", border: "1px solid #2a2a40", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
      <div style={{ color: "#8a8aa8", marginBottom: 3 }}>{label}</div>
      {payload.map((p, i) => <div key={i} style={{ color: p.color || "#e0e0f0" }}>{p.name}: <strong>{typeof p.value === "number" ? p.value.toLocaleString() : p.value}</strong></div>)}
    </div>
  );
};

const Badge = ({ value, suffix = "%" }) => (
  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 5, background: value > 0 ? "#4ade8015" : value < 0 ? "#ef444415" : "#8a8aa815", color: value > 0 ? "#4ade80" : value < 0 ? "#ef4444" : "#8a8aa8" }}>
    {value > 0 ? "↑" : value < 0 ? "↓" : "→"} {Math.abs(value)}{suffix}
  </span>
);

function scoreColor(s) {
  if (s >= 8) return { l: "Healthy", c: "#4ade80", b: "#4ade8015" };
  if (s >= 5) return { l: "Early Warning", c: "#fbbf24", b: "#fbbf2415" };
  if (s >= 3) return { l: "Stagnating", c: "#f97316", b: "#f9731615" };
  return { l: "Critical", c: "#ef4444", b: "#ef444415" };
}

// ─── MAIN APP ──────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState("upload"); // upload | tag | dashboard
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("analysis");
  const [channelName, setChannelName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Intermediate state: parsed but not yet format-tagged
  const [rawVideos, setRawVideos] = useState([]);
  const [taggedFormats, setTaggedFormats] = useState({});
  const [detectedCols, setDetectedCols] = useState([]);

  const parseCSV = useCallback((rawText, name) => {
    setError("");
    try {
      const result = Papa.parse(rawText.trim(), { header: true, skipEmptyLines: true });
      if (!result.data || result.data.length < 4) { setError("Need at least 4 videos."); return; }

      // Flexible column matcher — normalizes headers then checks keywords
      const cols = Object.keys(result.data[0] || {});
      const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
      const normCols = cols.map(c => ({ orig: c, n: norm(c) }));

      const findCol = (keywords) => {
        for (const kw of keywords) {
          const match = normCols.find(c => c.n.includes(kw));
          if (match) return match.orig;
        }
        return null;
      };

      const titleCol = findCol(["title", "video title", "video name", "content", "name"]);
      const viewsCol = findCol(["views", "view count", "watch time"]);
      const retCol = findCol([
        "average percentage viewed", "avg percentage viewed",
        "average percent viewed", "avg percent",
        "avg view percentage", "average view percentage",
        "avg percentage", "avg viewed",
        "retention", "avg %", "percent viewed",
        "percentage viewed", "avg duration"
      ]);
      const ctrCol = findCol([
        "impressions click through rate", "click through rate",
        "impressions ctr", "ctr", "click rate"
      ]);

      // Show which columns were detected
      const detected = [];
      if (titleCol) detected.push(`Title: "${titleCol}"`);
      if (viewsCol) detected.push(`Views: "${viewsCol}"`);
      if (retCol) detected.push(`Retention: "${retCol}"`);
      if (ctrCol) detected.push(`CTR: "${ctrCol}"`);

      if (!titleCol && !viewsCol) {
        setError(`Could not find title or views columns. Found columns: ${cols.join(", ")}. Expected: title, views, retention (avg % viewed), ctr.`);
        return;
      }

      const videos = result.data.slice(0, MAX_VIDEOS).map(row => {
        const rawRet = retCol ? String(row[retCol] || "0").replace(/[%,]/g, "").trim() : "0";
        const rawViews = viewsCol ? String(row[viewsCol] || "0").replace(/[%,]/g, "").trim() : "0";
        const rawCtr = ctrCol ? String(row[ctrCol] || "0").replace(/[%,]/g, "").trim() : "0";

        return {
          title: titleCol ? (row[titleCol] || "Untitled") : "Untitled",
          views: parseInt(rawViews) || 0,
          retention: parseFloat(rawRet) || 0,
          ctr: parseFloat(rawCtr) || 0,
        };
      }).filter(v => v.views > 0);

      if (videos.length < 4) {
        const retSample = videos.length > 0 ? ` Sample retention values: [${videos.slice(0, 3).map(v => v.retention).join(", ")}].` : "";
        setError(`Found ${videos.length} valid videos (need 4+). Detected columns: ${detected.join(", ") || "none"}.${retSample} Check your CSV has title, views, and "Average percentage viewed" columns.`);
        return;
      }

      // Set up format tagging with auto-suggestions
      const formats = {};
      videos.forEach((v, i) => { formats[i] = guessFormat(v.title); });

      setRawVideos(videos);
      setTaggedFormats(formats);
      setDetectedCols(detected);
      setChannelName(name || "My Channel");
      setScreen("tag");
    } catch (e) { setError("Error parsing CSV: " + e.message); }
  }, []);

  const finishTagging = () => {
    const tagged = rawVideos.map((v, i) => ({ ...v, format: taggedFormats[i] || "Other" }));
    const processed = processCreatorData(tagged);
    if (!processed) { setError("Could not process data."); return; }
    setData(processed);
    setScreen("dashboard");
    setTab("analysis");
  };

  const handleFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => parseCSV(e.target.result, channelName || file.name.replace(/\.csv$/i, ""));
    reader.readAsText(file);
  }, [channelName, parseCSV]);

  const handleDemo = () => {
    const processed = processCreatorData(DEMO_VIDEOS);
    setData(processed);
    setChannelName("CodeWithNadia (Demo)");
    setScreen("dashboard");
    setTab("analysis");
  };

  const handleDownload = async () => {
    if (!data) return;
    setGenerating(true);
    try { await generateDeck(data, channelName); } catch (e) { setError("Deck generation failed: " + e.message); }
    setGenerating(false);
  };

  const batchTag = (format) => {
    const updated = { ...taggedFormats };
    rawVideos.forEach((_, i) => { updated[i] = format; });
    setTaggedFormats(updated);
  };

  const box = { background: "#111119", borderRadius: 10, border: "1px solid #1d1d2e", padding: 20 };
  const lbl = { fontSize: 10.5, color: "#6b7394", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 600, marginBottom: 8 };

  const m = data?.metrics;
  const ri = m ? scoreColor(m.healthScore) : null;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a12", color: "#ddddf0", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
        * { box-sizing: border-box; margin: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 2px; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
        select { background: #1a1a2e; color: #ddddf0; border: 1px solid #2a2a40; border-radius: 6px; padding: 5px 8px; font-size: 12px; font-family: inherit; cursor: pointer; outline: none; }
        select:hover { border-color: #3a3a55; }
      `}</style>

      {/* HEADER */}
      <div style={{ padding: "16px 28px", borderBottom: "1px solid #1d1d2e", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff" }}>S</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>Stagnation Detector</h1>
          <span style={{ fontSize: 10, color: "#6b7394", background: "#1d1d2e", padding: "2px 8px", borderRadius: 4 }}>BETA</span>
        </div>
        {screen === "dashboard" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#6b7394" }}>{channelName}</span>
            <button onClick={() => { setScreen("upload"); setData(null); setError(""); }} style={{ padding: "6px 14px", borderRadius: 7, border: "1px solid #2a2a40", background: "transparent", color: "#8a8aa8", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>New Audit</button>
            <button onClick={handleDownload} disabled={generating} style={{ padding: "6px 16px", borderRadius: 7, border: "none", cursor: "pointer", background: generating ? "#333" : "#ef4444", color: "#fff", fontSize: 12, fontWeight: 600, fontFamily: "inherit", opacity: generating ? 0.6 : 1 }}>
              {generating ? "Generating..." : "↓ Download Strategy Deck"}
            </button>
          </div>
        )}
      </div>

      {/* ═══ UPLOAD SCREEN ═══ */}
      {screen === "upload" && (
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 28px", animation: "fadeUp 0.3s ease" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Upload Your YouTube Data</h2>
            <p style={{ fontSize: 14, color: "#6b7394", lineHeight: 1.6 }}>Paste or upload your YouTube Studio analytics to get a stagnation analysis and content strategy.</p>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ ...lbl, display: "block" }}>Channel Name</label>
            <input type="text" value={channelName} onChange={e => setChannelName(e.target.value)} placeholder="e.g. CodeWithNadia" style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #2a2a40", background: "#111119", color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none" }} />
          </div>

          <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }} onClick={() => { const i = document.createElement("input"); i.type = "file"; i.accept = ".csv"; i.onchange = e => handleFile(e.target.files[0]); i.click(); }} style={{ border: `2px dashed ${dragOver ? "#ef4444" : "#2a2a40"}`, borderRadius: 12, padding: "36px 20px", textAlign: "center", cursor: "pointer", marginBottom: 16, background: dragOver ? "#ef444408" : "#111119", transition: "all 0.2s" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
            <div style={{ fontSize: 14, color: "#fff", fontWeight: 600, marginBottom: 4 }}>Drop CSV file here or click to browse</div>
            <div style={{ fontSize: 12, color: "#6b7394" }}>Max {MAX_VIDEOS} videos · .csv format</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
            <div style={{ flex: 1, height: 1, background: "#1d1d2e" }} />
            <span style={{ fontSize: 11, color: "#6b7394" }}>OR PASTE DATA</span>
            <div style={{ flex: 1, height: 1, background: "#1d1d2e" }} />
          </div>

          <textarea value={csvText} onChange={e => setCsvText(e.target.value)} placeholder={'title,views,retention,ctr\n"My First Video",15000,45,5.2\n"Second Video",22000,52,6.1'} style={{ width: "100%", height: 140, padding: "12px 14px", borderRadius: 8, border: "1px solid #2a2a40", background: "#111119", color: "#ddddf0", fontSize: 12.5, fontFamily: "'JetBrains Mono', monospace", resize: "vertical", outline: "none" }} />

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button onClick={() => csvText && parseCSV(csvText, channelName)} disabled={!csvText.trim()} style={{ flex: 1, padding: "12px", borderRadius: 8, border: "none", cursor: csvText.trim() ? "pointer" : "not-allowed", background: csvText.trim() ? "#ef4444" : "#333", color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: "inherit" }}>Analyze My Data</button>
            <button onClick={handleDemo} style={{ padding: "12px 20px", borderRadius: 8, border: "1px solid #2a2a40", background: "transparent", color: "#8a8aa8", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Try Demo Data</button>
          </div>

          {error && <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, background: "#ef444415", border: "1px solid #ef444430", color: "#ef4444", fontSize: 13 }}>{error}</div>}

          <div style={{ marginTop: 24, padding: 16, borderRadius: 10, background: "#111119", border: "1px solid #1d1d2e" }}>
            <div style={{ ...lbl, marginBottom: 10 }}>Expected CSV Columns</div>
            <code style={{ fontSize: 11.5, color: "#8a8aa8", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.8, display: "block" }}>
              title, views, retention, ctr<br />
              "My Video Title", 15000, 45.2, 5.1
            </code>
            <p style={{ fontSize: 11, color: "#6b7394", marginTop: 10, lineHeight: 1.5 }}>
              <strong>retention</strong> = "Average percentage viewed" from YouTube Studio<br />
              <strong>ctr</strong> = "Impressions click-through rate" (optional)<br />
              Export: YouTube Studio → Analytics → Advanced Mode → Export
            </p>
          </div>

          <div style={{ marginTop: 20, fontSize: 11, color: "#4a4a60", lineHeight: 1.6 }}>
            <p>🔒 Your data is processed entirely in your browser. Nothing is stored or sent anywhere.</p>
            <p style={{ marginTop: 6 }}>📋 By uploading, you confirm you have the right to use this data.</p>
            <p style={{ marginTop: 6 }}>⚠️ This tool provides data-driven analysis, not professional consulting advice.</p>
          </div>
        </div>
      )}

      {/* ═══ FORMAT TAGGING SCREEN ═══ */}
      {screen === "tag" && (
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "36px 28px", animation: "fadeUp 0.3s ease" }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Tag Your Video Formats</h2>
          <p style={{ fontSize: 13, color: "#6b7394", lineHeight: 1.6, marginBottom: 6 }}>
            YouTube Studio doesn't track content format. Help us categorize your videos so we can analyze which formats are working best. We've auto-suggested based on titles — adjust where needed.
          </p>
          <p style={{ fontSize: 12, color: "#4a4a60", marginBottom: 14 }}>
            {rawVideos.length} videos found · Takes about 1–2 minutes
          </p>

          {/* Detected columns confirmation */}
          <div style={{ padding: "10px 14px", borderRadius: 8, background: "#4ade8008", border: "1px solid #4ade8020", marginBottom: 16, fontSize: 12, color: "#6b7394" }}>
            <span style={{ color: "#4ade80", fontWeight: 600 }}>✓ Columns detected: </span>
            {detectedCols.join("  ·  ")}
            {rawVideos.length > 0 && rawVideos[0].retention > 0 && (
              <span style={{ marginLeft: 8, color: "#4ade80" }}>· Retention values look good ✓</span>
            )}
            {rawVideos.length > 0 && rawVideos[0].retention === 0 && (
              <span style={{ marginLeft: 8, color: "#ef4444" }}>· ⚠ Retention values are 0 — check column name in your CSV</span>
            )}
          </div>

          {/* Batch tagging */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "#6b7394" }}>Quick tag all as:</span>
            {["Tutorial / How-to", "Talking Head Commentary", "Vlog (Video Blog)", "Project Build", "Review / Unboxing"].map(f => (
              <button key={f} onClick={() => batchTag(f)} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #2a2a40", background: "transparent", color: "#8a8aa8", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{f}</button>
            ))}
          </div>

          {/* Video list with format dropdowns */}
          <div style={{ display: "flex", flexDirection: "column", gap: 1, marginBottom: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 55px 150px", padding: "8px 10px", fontSize: 10, color: "#6b7394", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, borderBottom: "1px solid #1d1d2e" }}>
              <span>Title</span><span style={{ textAlign: "right" }}>Views</span><span style={{ textAlign: "right" }}>Ret %</span><span style={{ textAlign: "center" }}>Format</span>
            </div>
            {rawVideos.map((v, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 60px 55px 150px", padding: "8px 10px", alignItems: "center", borderBottom: "1px solid #15151f", background: i % 2 === 0 ? "transparent" : "#0d0d18" }}>
                <span style={{ fontSize: 12.5, color: "#d0d0e0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 8 }}>{v.title}</span>
                <span style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#8a8aa8" }}>{(v.views / 1000).toFixed(1)}K</span>
                <span style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#8a8aa8" }}>{v.retention}%</span>
                <div style={{ textAlign: "center" }}>
                  <select value={taggedFormats[i] || "Other"} onChange={e => setTaggedFormats(prev => ({ ...prev, [i]: e.target.value }))}>
                    {FORMAT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={finishTagging} style={{ flex: 1, padding: "12px", borderRadius: 8, border: "none", cursor: "pointer", background: "#ef4444", color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: "inherit" }}>
              Run Analysis →
            </button>
            <button onClick={() => setScreen("upload")} style={{ padding: "12px 20px", borderRadius: 8, border: "1px solid #2a2a40", background: "transparent", color: "#8a8aa8", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Back</button>
          </div>
        </div>
      )}

      {/* ═══ DASHBOARD ═══ */}
      {screen === "dashboard" && data && (
        <>
          <div style={{ padding: "0 28px", borderBottom: "1px solid #1d1d2e", display: "flex", gap: 0 }}>
            {[{ key: "analysis", label: "Analysis Engine" }, { key: "strategy", label: "Content Strategy" }].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: "12px 20px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", background: "transparent", color: tab === t.key ? "#fff" : "#6b7394", borderBottom: tab === t.key ? "2px solid #ef4444" : "2px solid transparent" }}>{t.label}</button>
            ))}
          </div>

          <div style={{ padding: "20px 28px 40px", maxWidth: 920 }} key={tab}>

            {/* ═══ ANALYSIS ═══ */}
            {tab === "analysis" && (
              <div style={{ animation: "fadeUp 0.3s ease" }}>
                <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 14, marginBottom: 14 }}>
                  {/* Score gauge */}
                  <div style={{ ...box, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                    <div style={lbl}>Channel Health</div>
                    <div style={{ position: "relative", width: 120, height: 75, marginBottom: 4 }}>
                      <svg viewBox="0 0 130 80" style={{ width: "100%", height: "100%" }}>
                        <path d="M 15 70 A 50 50 0 0 1 115 70" fill="none" stroke="#1d1d2e" strokeWidth="10" strokeLinecap="round" />
                        <path d="M 15 70 A 50 50 0 0 1 40 28" fill="none" stroke="#ef4444" strokeWidth="10" strokeLinecap="round" opacity="0.4" />
                        <path d="M 40 28 A 50 50 0 0 1 65 20" fill="none" stroke="#f97316" strokeWidth="10" strokeLinecap="round" opacity="0.4" />
                        <path d="M 65 20 A 50 50 0 0 1 90 28" fill="none" stroke="#fbbf24" strokeWidth="10" strokeLinecap="round" opacity="0.4" />
                        <path d="M 90 28 A 50 50 0 0 1 115 70" fill="none" stroke="#4ade80" strokeWidth="10" strokeLinecap="round" opacity="0.4" />
                        {(() => { const a = -180 + (m.healthScore / 10) * 180; const r = a * Math.PI / 180; return <line x1="65" y1="70" x2={65 + 40 * Math.cos(r)} y2={70 + 40 * Math.sin(r)} stroke={ri.c} strokeWidth="2.5" strokeLinecap="round" />; })()}
                        <circle cx="65" cy="70" r="4" fill={ri.c} />
                      </svg>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                      <span style={{ fontSize: 34, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: ri.c }}>{m.healthScore}</span>
                      <span style={{ fontSize: 14, color: "#6b7394" }}>/ 10</span>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 5, marginTop: 4, background: ri.b, color: ri.c }}>{ri.l.toUpperCase()}</span>
                    <div style={{ fontSize: 11, color: "#6b7394", marginTop: 6 }}>
                      {m.healthScore < 5 ? `${m.churn}% churn risk in 60 days` : "Engagement looks stable"}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {[
                      { label: "Avg Views (Recent)", val: m.avgViews.toLocaleString(), trend: m.vt },
                      { label: "Avg Retention", val: `${m.avgRet}%`, trend: m.rt },
                      { label: "CTR Trend", val: `${m.avgCtr}%`, trend: m.ct },
                      { label: "Churn Risk (60-day)", val: `${m.churn}%`, trend: null, color: m.churn > 40 ? "#ef4444" : m.churn > 20 ? "#fbbf24" : "#4ade80" },
                    ].map((kpi, i) => (
                      <div key={i} style={box}>
                        <div style={{ ...lbl, marginBottom: 6 }}>{kpi.label}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: kpi.color || "#fff" }}>{kpi.val}</span>
                          {kpi.trend !== null && <Badge value={kpi.trend} />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ ...box, marginBottom: 14 }}>
                  <div style={lbl}>Format Performance</div>
                  <p style={{ fontSize: 12, color: "#6b7394", marginBottom: 14 }}>Average retention by your tagged content format.</p>
                  <ResponsiveContainer width="100%" height={Math.max(120, data.formats.length * 32)}>
                    <BarChart data={data.formats} layout="vertical" margin={{ left: 10 }}>
                      <XAxis type="number" domain={[0, 80]} tick={{ fill: "#6b7394", fontSize: 10 }} axisLine={{ stroke: "#1d1d2e" }} />
                      <YAxis type="category" dataKey="name" tick={{ fill: "#c0c0d0", fontSize: 11 }} width={130} axisLine={false} />
                      <Tooltip content={<Tip />} />
                      <Bar dataKey="retention" name="Avg Retention %" radius={[0, 5, 5, 0]} barSize={20}>
                        {data.formats.map((f, i) => <Cell key={i} fill={f.trend > 5 ? "#4ade80" : f.trend < -5 ? "#ef4444" : "#6b7394"} fillOpacity={0.65} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {data.weeklyData.length > 2 && (
                  <div style={{ ...box, marginBottom: 14 }}>
                    <div style={lbl}>Views Trend</div>
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={data.weeklyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1d1d2e" />
                        <XAxis dataKey="week" tick={{ fill: "#6b7394", fontSize: 10 }} axisLine={{ stroke: "#1d1d2e" }} />
                        <YAxis tick={{ fill: "#6b7394", fontSize: 10 }} axisLine={{ stroke: "#1d1d2e" }} />
                        <Tooltip content={<Tip />} />
                        <Line type="monotone" dataKey="views" stroke="#ef4444" strokeWidth={2} dot={{ r: 2.5, fill: "#ef4444" }} name="Views" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div style={box}>
                  <div style={lbl}>All Videos ({data.videos.length})</div>
                  <div style={{ overflowX: "auto" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 60px 55px 50px", padding: "8px 10px", fontSize: 10, color: "#6b7394", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, borderBottom: "1px solid #1d1d2e" }}>
                      <span>Title</span><span>Format</span><span style={{ textAlign: "right" }}>Views</span><span style={{ textAlign: "right" }}>Ret %</span><span style={{ textAlign: "right" }}>CTR</span>
                    </div>
                    {data.videos.map((v, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px 60px 55px 50px", padding: "7px 10px", fontSize: 12, alignItems: "center", borderBottom: "1px solid #15151f", background: i % 2 === 0 ? "transparent" : "#0d0d18" }}>
                        <span style={{ color: "#d0d0e0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 8 }}>{v.title}</span>
                        <span style={{ fontSize: 11, color: "#8a8aa8" }}>{v.format}</span>
                        <span style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#c0c0d0" }}>{(v.views / 1000).toFixed(1)}K</span>
                        <span style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#c0c0d0" }}>{v.retention}%</span>
                        <span style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#c0c0d0" }}>{v.ctr || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ═══ STRATEGY ═══ */}
            {tab === "strategy" && (
              <div style={{ animation: "fadeUp 0.3s ease" }}>
                <div style={{ ...box, marginBottom: 14, borderLeft: "3px solid #ef4444", background: "linear-gradient(135deg, #111119, #151520)" }}>
                  <h2 style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Content Strategy — {channelName}</h2>
                  <p style={{ fontSize: 13, color: "#8a8aa8", lineHeight: 1.6 }}>Based on {data.videos.length} videos. Health Score: <span style={{ color: ri.c, fontWeight: 600 }}>{m.healthScore}/10</span>.</p>
                </div>

                {[
                  { num: "01", title: "Format", ...data.strategy.format },
                  { num: "02", title: "Positioning", current: data.strategy.positioning.current, pivot: data.strategy.positioning.pivot, hook: data.strategy.positioning.hook },
                  { num: "03", title: "Frequency", current: data.strategy.frequency.current, recommended: data.strategy.frequency.recommended, reason: data.strategy.frequency.reason },
                ].map((p, i) => (
                  <div key={i} style={{ ...box, marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: "#ef4444", background: "#ef444418", padding: "3px 8px", borderRadius: 5 }}>{p.num}</span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{p.title}</span>
                    </div>
                    {p.do ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ padding: "10px 14px", borderRadius: 7, background: "#4ade8008", border: "1px solid #4ade8015" }}><span style={{ fontSize: 11, fontWeight: 600, color: "#4ade80", marginRight: 8 }}>DO:</span><span style={{ fontSize: 13, color: "#d0d0e0" }}>{p.do}</span></div>
                        <div style={{ padding: "10px 14px", borderRadius: 7, background: "#ef444408", border: "1px solid #ef444415" }}><span style={{ fontSize: 11, fontWeight: 600, color: "#ef4444", marginRight: 8 }}>STOP:</span><span style={{ fontSize: 13, color: "#d0d0e0" }}>{p.stop}</span></div>
                        <div style={{ padding: "10px 14px", borderRadius: 7, background: "#1a1a28", border: "1px solid #1d1d2e" }}><span style={{ fontSize: 11, fontWeight: 600, color: "#fbbf24", marginRight: 8 }}>RATIO:</span><span style={{ fontSize: 13, color: "#d0d0e0" }}>{p.ratio}</span></div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ padding: "10px 14px", borderRadius: 7, background: "#ef444408", border: "1px solid #ef444415" }}><span style={{ fontSize: 11, fontWeight: 600, color: "#ef4444", marginRight: 8 }}>NOW:</span><span style={{ fontSize: 13, color: "#d0d0e0" }}>{p.current}</span></div>
                        <div style={{ padding: "10px 14px", borderRadius: 7, background: "#4ade8008", border: "1px solid #4ade8015" }}><span style={{ fontSize: 11, fontWeight: 600, color: "#4ade80", marginRight: 8 }}>{p.pivot ? "PIVOT TO:" : "SHIFT TO:"}</span><span style={{ fontSize: 13, color: "#d0d0e0" }}>{p.pivot || p.recommended}</span></div>
                        {(p.hook || p.reason) && <div style={{ padding: "10px 14px", borderRadius: 7, background: "#1a1a28", border: "1px solid #1d1d2e" }}><span style={{ fontSize: 11, fontWeight: 600, color: "#fbbf24", marginRight: 8 }}>WHY:</span><span style={{ fontSize: 13, color: "#d0d0e0" }}>{p.hook || p.reason}</span></div>}
                      </div>
                    )}
                  </div>
                ))}

                <div style={{ ...box, marginBottom: 12 }}>
                  <div style={lbl}>4-Week Content Calendar</div>
                  <p style={{ fontSize: 11, color: "#6b7394", marginBottom: 10, fontStyle: "italic" }}>Suggested starting points — not guarantees. Adapt based on your expertise and audience feedback.</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {data.strategy.calendar.map((item, i) => (
                      <div key={i} style={{ padding: "14px 16px", borderRadius: 8, background: "#0d0d18", border: "1px solid #1d1d2e" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: "#ef4444", background: "#ef444415", padding: "2px 8px", borderRadius: 4 }}>{item.wk}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: "#8a8aa8", background: "#1d1d2e", padding: "2px 8px", borderRadius: 4 }}>{item.format}</span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 3 }}>{item.title}</div>
                        <div style={{ fontSize: 11.5, color: "#6b7394" }}>{item.why}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ ...box, marginBottom: 12, background: "linear-gradient(135deg, #111119, #101520)" }}>
                  <div style={lbl}>Projected Impact</div>
                  <p style={{ fontSize: 11, color: "#6b7394", marginBottom: 10, fontStyle: "italic" }}>Directional estimates, not predictions. Based on your historical format performance.</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    {[
                      { label: "Expected View Lift", value: data.strategy.impact.viewLift, icon: "📈" },
                      { label: "Retention Target", value: data.strategy.impact.retTarget, icon: "🎯" },
                      { label: "Sub Growth", value: data.strategy.impact.subGrowth, icon: "📊" },
                    ].map((imp, i) => (
                      <div key={i} style={{ padding: "14px", borderRadius: 8, background: "#0d0d18", border: "1px solid #1d1d2e", textAlign: "center" }}>
                        <div style={{ fontSize: 20, marginBottom: 6 }}>{imp.icon}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#4ade80", fontFamily: "'JetBrains Mono', monospace" }}>{imp.value}</div>
                        <div style={{ fontSize: 11, color: "#6b7394", marginTop: 4 }}>{imp.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={box}>
                  <div style={lbl}>Validate With Free Tools</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[{ tool: "Google Trends", use: "Verify topic search volume" }, { tool: "YouTube Search Suggest", use: "See autocomplete suggestions" }, { tool: "vidIQ (free)", use: "Check competition score" }, { tool: "TubeBuddy (free)", use: "A/B test thumbnails" }].map((t, i) => (
                      <div key={i} style={{ padding: "10px 12px", borderRadius: 7, background: "#0d0d18", border: "1px solid #1d1d2e" }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#d0d0e0" }}>{t.tool}</div>
                        <div style={{ fontSize: 11, color: "#6b7394", marginTop: 2 }}>{t.use}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div style={{ padding: "14px 28px", borderTop: "1px solid #1d1d2e", display: "flex", justifyContent: "space-between", fontSize: 10, color: "#3a3a50" }}>
        <span>Stagnation Detector — Content Strategy Tool</span>
        <span>Your data stays in your browser · {new Date().getFullYear()}</span>
      </div>
    </div>
  );
}

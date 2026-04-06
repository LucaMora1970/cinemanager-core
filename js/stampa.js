// =================================================================
// CineManager — Modulo: stampa
// Generazione PDF, cartelli, copertine A4
// Dipendenze: CINEMA_CONFIG, S (core.js)
// =================================================================

function pPDF(type, landscape){
  const days=wdays();const wd=wdates();
  const CN='Cinema Multisala Teatro Mendrisio';
  // Include OA bookings as virtual shows in reports
  const oaVirtual=(S.bookings||[]).filter(function(b){return b.type==='openair';}).flatMap(function(b){return(b.dates||[]).filter(function(d){return wd.includes(d.date);}).map(function(d){return{id:b.id,filmId:b.filmId,sala:b.sala,day:d.date,start:d.start,end:d.end,_oa:true,_location:b.location,_post:b.postazione};});});
  const allShows=S.shows.filter(s=>wd.includes(s.day)).concat(oaVirtual).sort((a,b)=>a.day.localeCompare(b.day)||a.start.localeCompare(b.start));
  const wl=fd(days[0])+' \u2014 '+fd(days[6]);
  const DAB=['Gio','Ven','Sab','Dom','Lun','Mar','Mer'];
  const now=new Date().toLocaleDateString('it-IT');
  let html='';
  const LOGO='data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iQ2FscXVlXzEiIGRhdGEtbmFtZT0iQ2FscXVlIDEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgdmlld0JveD0iMCAwIDE3MjYuMyAxMTE2Ljg1Ij4KICA8ZGVmcz4KICAgIDxzdHlsZT4KICAgICAgLmNscy0xIHsKICAgICAgICBmaWxsOiAjZWY3ODE1OwogICAgICB9CiAgICA8L3N0eWxlPgogIDwvZGVmcz4KICA8Zz4KICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTUxMy40OSw3NTEuMTZjLTEwNi4yMiwxMS44LTIwMS45LTY0Ljc1LTIxMy42OS0xNzAuOTgtMTEuOC0xMDYuMjIsNjQuNzUtMjAxLjksMTcwLjk4LTIxMy42OWw0Mi43MiwzODQuNjdaIi8+CiAgICA8Y2lyY2xlIGNsYXNzPSJjbHMtMSIgY3g9IjU4NC4yNSIgY3k9IjQ1OC4zOSIgcj0iNzEuNTYiLz4KICAgIDxwb2x5Z29uIGNsYXNzPSJjbHMtMSIgcG9pbnRzPSI1NTYuNzIgNTg5LjExIDU3Ny40OCA2ODYuNzkgOTIyLjYzIDc0NC41MyA5MDUuODggNDA2LjI1IDU1Ni43MiA1ODkuMTEiLz4KICA8L2c+CiAgPGc+CiAgICA8Zz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTA1Ni42NCw0MzYuNTZjLTYuODYsMi40OC0xMC42MywzLjI4LTE0LjkxLDMuMjgtMTEuNTMsMC0yMC4xNy00LjU3LTI1LjY0LTkuOTQtNi40Ni02LjQ2LTEwLjA0LTE1LjUtMTAuMDQtMjQuMTUsMC05LjQ0LDQuMDctMTguMzksMTAuMDQtMjQuNDUsNS44Ni01Ljk2LDE0LjcxLTEwLjM0LDI1LjA0LTEwLjM0LDMuMTgsMCw4LjM1LjUsMTUuNSwzLjM4djIwLjU3Yy01LjU3LTYuODYtMTIuMTItNy4yNi0xNS4wMS03LjI2LTQuOTcsMC04Ljc1LDEuNDktMTEuOTMsNC4zNy00LjA4LDMuNzgtNS43Niw4Ljk0LTUuNzYsMTMuNjFzMS44OSw5LjY0LDUuMzcsMTIuOTJjMi44OCwyLjY4LDcuNDUsNC41NywxMi4zMiw0LjU3LDIuNTgsMCw4Ljk0LS4zLDE1LjAxLTYuOTZ2MjAuMzdaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTEwNzQuMDMsMzY2LjQ5YzQuOTcsMCw4Ljk0LDMuOTgsOC45NCw4Ljk0cy0zLjk4LDguOTUtOC45NCw4Ljk1LTguOTQtMy45OC04Ljk0LTguOTUsMy45OC04Ljk0LDguOTQtOC45NFpNMTA4MS45OCwzOTMuOTJ2NDQuNDJoLTE1Ljl2LTQ0LjQyaDE1LjlaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTEwOTIuODEsMzkzLjkyaDE1Ljl2NS41N2M0LjM3LTUuNzcsMTAuMjQtNi41NiwxNC4xMS02LjU2LDQuNTcsMCw5LjQ0LDEuMDksMTMuMTIsNC43NywzLjc4LDMuNzgsNC4xNyw3LjU1LDQuMTcsMTIuNDJ2MjguMjJoLTE1Ljl2LTIyLjQ2YzAtMi41OC4xLTYuNDYtMS45OS04LjY1LTEuNDktMS41OS0zLjQ4LTEuODktNS4wNy0xLjg5LTIuNDgsMC00LjU3Ljg5LTUuODYsMi4wOS0xLjU5LDEuNDktMi41OCw0LjM3LTIuNTgsNy4wNnYyMy44NWgtMTUuOXYtNDQuNDJaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTExOTguMDUsNDE5LjA2aC0zMy4wOWMwLDIuMzkuODksNS41NywyLjc4LDcuNDUuOTkuOTksMi45OCwyLjE5LDYuNTYsMi4xOS40LDAsMy4xOC0uMSw1LjE3LTEuMTkuOTktLjYsMi4wOS0xLjU5LDIuNzgtMi45OGgxNS4yMWMtLjcsMi40OS0yLjA5LDUuOTYtNS4zNyw5LjE0LTMuMjgsMy4xOC04LjQ1LDYuMTYtMTguMDksNi4xNi01Ljg2LDAtMTIuOTItMS4yOS0xOC4zOS02Ljc2LTIuODgtMi44OC02LjU2LTguMzUtNi41Ni0xNi44LDAtNy40NSwyLjc4LTEzLjQyLDYuNjYtMTcuMTksMy42OC0zLjU4LDkuNDQtNi40NiwxOC4xOS02LjQ2LDUuMTcsMCwxMS44MywxLjA5LDE3LjA5LDYuMDYsNi4yNiw1Ljk2LDcuMDYsMTMuNzEsNy4wNiwxOC42OHYxLjY5Wk0xMTgzLjQ0LDQwOS45MmMtLjQtMS42OS0xLjM5LTMuNTgtMi41OC00Ljc3LTIuMDktMi4wOS00Ljk3LTIuMzktNi41Ni0yLjM5LTIuNjgsMC00Ljc3LjctNi40NiwyLjM5LTEuMDksMS4xOS0yLjA5LDIuNzgtMi4zOSw0Ljc3aDE3Ljk5WiIvPgogICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xMjA3LjE4LDM5My45MmgxNS45djUuMzdjMy43OC00LjU3LDguOTQtNi4xNiwxMy4zMi02LjE2LDMuMTgsMCw2LjE2LjY5LDguNTUsMS45OSwzLjI4LDEuNjksNS4wNyw0LjE3LDYuMTYsNi4zNiwxLjc5LTMuMTgsNC4wOC01LjA3LDYuMDYtNi4xNiwzLjE4LTEuNzksNi4yNi0yLjE5LDkuMjQtMi4xOSwzLjI4LDAsOC42NS41LDEyLjMyLDQuMDcsMy45OCwzLjg4LDQuMTcsOS4xNCw0LjE3LDEyLjIydjI4LjkyaC0xNS45di0yMS45NmMwLTQuNjctLjUtNy44NS0yLjI5LTkuNTQtLjktLjgtMi4wOS0xLjQ5LTQuMTctMS40OS0xLjc5LDAtMy4yOC41LTQuNjcsMS43OS0yLjY4LDIuNTgtMi44OCw2LjI2LTIuODgsOC40NXYyMi43NmgtMTUuOXYtMjEuOTZjMC00LjI3LS4zLTcuNjUtMi4wOS05LjU0LTEuMzktMS40OS0zLjE4LTEuNzktNC43Ny0xLjc5LTEuNjksMC0zLjA4LjMtNC4zNywxLjU5LTIuNzgsMi42OC0yLjc4LDYuOTYtMi43OCw5Ljc0djIxLjk2aC0xNS45di00NC40MloiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTMyOC4zMiwzOTMuOTJoMTUuOXY0NC40MmgtMTUuOXYtNC44N2MtMy42OCw1LjA3LTkuNDQsNi4zNi0xMy44MSw2LjM2LTQuNzcsMC0xMC42My0xLjM5LTE2LTcuMDYtNC4yNy00LjU3LTYuMzYtOS42NC02LjM2LTE2LjMsMC04LjM1LDMuMjgtMTQuMjEsNi44Ni0xNy43OSwzLjc4LTMuNzgsOS42NC02LjI2LDE2LTYuMjYsNy4xNiwwLDExLjQzLDMuNjgsMTMuMzIsNS43NnYtNC4yN1pNMTMxMS42Myw0MDguODNjLTIuMTksMi4wOS0zLjE4LDQuOTctMy4xOCw3LjI2LDAsMi41OCwxLjA5LDUuMzcsMy4wOCw3LjI2LDEuNjksMS41OSw0LjQ3LDIuOTgsNy4xNiwyLjk4czUuMTctMS4wOSw3LjE2LTMuMDhjMS4zOS0xLjM5LDIuOTgtMy41OCwyLjk4LTcuMTYsMC0yLjA5LS42LTQuODctMy4wOC03LjI2LTEuNDktMS4zOS0zLjc4LTIuODgtNy4xNi0yLjg4LTEuOTksMC00LjY3LjctNi45NiwyLjg4WiIvPgogICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xMDA2LjA1LDU0MC4wOWwxMS4yMy02Ni4yOWgxNi45OWwxMy40MiwzNS4zOCwxNC4yMS0zNS4zOGgxNy4xOWw5Ljk0LDY2LjI5aC0xNy4xOWwtNC44Ny0zOC4xNi0xNiwzOC4xNmgtNi44NmwtMTUuMzEtMzguMTYtNS42NiwzOC4xNmgtMTcuMDlaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTExMTQuMzcsNDk1LjY3djI0Ljg1YzAsMS43OS4zLDQuNTcsMi4zOSw2LjQ2LDEuNTksMS4zOSwzLjY4LDEuNjksNS41NywxLjY5LDEuOTksMCwzLjg4LS4yLDUuNjYtMS44OSwxLjk5LTEuOTksMi4yOS00LjI3LDIuMjktNi4yNnYtMjQuODVoMTUuOXYyNy43M2MwLDMuNzgtLjMsNy44NS00LjI3LDExLjkzLTUuNDcsNS42Ny0xMy4xMiw2LjI2LTE5LjE4LDYuMjYtNi42NiwwLTE0LjgxLS42OS0yMC4wOC02LjM2LTMuMzgtMy41OC00LjE3LTcuNTUtNC4xNy0xMS44M3YtMjcuNzNoMTUuOVoiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTE3Myw0NjcuNjR2NzIuNDVoLTE1Ljl2LTcyLjQ1aDE1LjlaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTEyMDEuNDIsNTA4LjY5djMxLjRoLTE1Ljl2LTMxLjRoLTUuMDd2LTEzLjAyaDUuMDd2LTE0LjYxaDE1Ljl2MTQuNjFoOS4wNHYxMy4wMmgtOS4wNFoiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTIyNC4zOCw0NjguMjRjNC45NywwLDguOTQsMy45OCw4Ljk0LDguOTRzLTMuOTgsOC45NS04Ljk0LDguOTUtOC45NC0zLjk4LTguOTQtOC45NSwzLjk4LTguOTQsOC45NC04Ljk0Wk0xMjMyLjMzLDQ5NS42N3Y0NC40MmgtMTUuOXYtNDQuNDJoMTUuOVoiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTI0Ni4wNCw1MjUuMzhjMS44OSwxLjM5LDQuMTcsMi41OSw2LjM2LDMuMjgsMS45OS43LDQuNDcsMS4wOSw2LjE2LDEuMDksMS4xOSwwLDMuMDgtLjMsNC4wOC0xLjE5LjY5LS42OS44LTEuMjkuOC0yLjA5LDAtLjY5LS4xLTEuMzktLjgtMS45OS0uOTktLjktMi41OC0xLjE5LTQuMTctMS41OWwtNC4xNy0uOTljLTIuMTktLjUtNS4zNy0xLjI5LTcuNzUtMy44OC0xLjY5LTEuNzktMi44OC00LjI3LTIuODgtNy42NSwwLTQuMjcsMS42OS04LjI1LDQuMTctMTAuODMsMy4zOC0zLjQ4LDkuMzQtNS4zNywxNS45LTUuMzdzMTEuNjMsMS43OSwxNC4yMSwyLjg4bC01LjM3LDEwLjE0Yy0yLjE5LS45OS01LjQ3LTIuMTktOC4zNS0yLjE5LTEuNTksMC0yLjY4LjMtMy42OC45LS45LjUtMS4zOSwxLjE5LTEuMzksMi4xOSwwLDEuMzkuODksMi4wOSwxLjg5LDIuNDgsMS40OS42LDIuNzguNiw1LjI3LDEuMjlsMi44OC43OWMyLjA5LjYsNS4yNywyLjE5LDYuNTYsMy40OCwyLjE5LDIuMDksMy4zOCw1LjU3LDMuMzgsOC44NSwwLDUuMzctMi4yOSw4Ljk0LTQuNDcsMTEuMDMtNS4xNyw1LjE3LTEyLjcyLDUuNTctMTYuNCw1LjU3LTMuOTgsMC0xMC4yNC0uNS0xNy44OS01LjE3bDUuNjYtMTEuMDNaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTEzMjEuNjYsNDk1LjY3aDE1Ljl2NDQuNDJoLTE1Ljl2LTQuODdjLTMuNjgsNS4wNy05LjQ0LDYuMzYtMTMuODEsNi4zNi00Ljc3LDAtMTAuNjMtMS4zOS0xNi03LjA2LTQuMjctNC41Ny02LjM2LTkuNjQtNi4zNi0xNi4zLDAtOC4zNSwzLjI4LTE0LjIxLDYuODYtMTcuNzksMy43OC0zLjc4LDkuNjQtNi4yNiwxNi02LjI2LDcuMTYsMCwxMS40MywzLjY4LDEzLjMyLDUuNzZ2LTQuMjdaTTEzMDQuOTcsNTEwLjU4Yy0yLjE5LDIuMDktMy4xOCw0Ljk3LTMuMTgsNy4yNiwwLDIuNTgsMS4wOSw1LjM3LDMuMDgsNy4yNiwxLjY5LDEuNTksNC40NywyLjk4LDcuMTYsMi45OHM1LjE3LTEuMDksNy4xNi0zLjA4YzEuMzktMS4zOSwyLjk4LTMuNTgsMi45OC03LjE2LDAtMi4wOS0uNi00Ljg3LTMuMDgtNy4yNi0xLjQ5LTEuMzktMy43OC0yLjg4LTcuMTYtMi44OC0xLjk5LDAtNC42Ny43LTYuOTYsMi44OFoiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTM2NC4zOSw0NjcuNjR2NzIuNDVoLTE1Ljl2LTcyLjQ1aDE1LjlaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTE0MDkuNjEsNDk1LjY3aDE1Ljl2NDQuNDJoLTE1Ljl2LTQuODdjLTMuNjgsNS4wNy05LjQ0LDYuMzYtMTMuODEsNi4zNi00Ljc3LDAtMTAuNjMtMS4zOS0xNi03LjA2LTQuMjctNC41Ny02LjM2LTkuNjQtNi4zNi0xNi4zLDAtOC4zNSwzLjI4LTE0LjIxLDYuODYtMTcuNzksMy43OC0zLjc4LDkuNjQtNi4yNiwxNi02LjI2LDcuMTYsMCwxMS40MywzLjY4LDEzLjMyLDUuNzZ2LTQuMjdaTTEzOTIuOTEsNTEwLjU4Yy0yLjE5LDIuMDktMy4xOCw0Ljk3LTMuMTgsNy4yNiwwLDIuNTgsMS4wOSw1LjM3LDMuMDgsNy4yNiwxLjY5LDEuNTksNC40NywyLjk4LDcuMTYsMi45OHM1LjE3LTEuMDksNy4xNi0zLjA4YzEuMzktMS4zOSwyLjk4LTMuNTgsMi45OC03LjE2LDAtMi4wOS0uNi00Ljg3LTMuMDgtNy4yNi0xLjQ5LTEuMzktMy43OC0yLjg4LTcuMTYtMi44OC0xLjk5LDAtNC42Ny43LTYuOTYsMi44OFoiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTAyOC40Miw1ODEuMTh2NTYuNzVoLTEwLjE0di01Ni43NWgtMTUuMjF2LTkuNTRoNDAuNTV2OS41NGgtMTUuMjFaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTEwODQuMjcsNjI4LjM5Yy0xLjc5LDMuMTgtNC4zNyw1Ljk2LTcuMDYsNy42NS0zLjM4LDIuMTktNy44NSwzLjE4LTEyLjMyLDMuMTgtNS41NywwLTEwLjE0LTEuMzktMTQuMTEtNS4zNy0zLjk4LTMuOTgtNi4xNi05Ljc0LTYuMTYtMTZzMi4yOS0xMi43Miw2LjY2LTE3LjE5YzMuNDgtMy40OCw4LjA1LTUuNjcsMTQuMDEtNS42Nyw2LjY2LDAsMTAuOTMsMi44OCwxMy40Miw1LjQ3LDUuMzcsNS41Nyw1Ljg2LDEzLjMyLDUuODYsMTcuNjl2MS4xOWgtMzAuMDFjLjIsMi45OCwxLjQ5LDYuMzYsMy41OCw4LjQ1LDIuMjksMi4yOSw1LjA3LDIuNjgsNy40NSwyLjY4LDIuNjgsMCw0LjY3LS42LDYuNjYtMi4wOSwxLjY5LTEuMjksMi45OC0yLjk4LDMuODgtNC41N2w4LjE1LDQuNTdaTTEwNzQuNjIsNjExLjM5Yy0uNC0yLjI5LTEuNDktNC4yNy0yLjk4LTUuNjYtMS4yOS0xLjE5LTMuMzgtMi4zOS02LjU2LTIuMzktMy4zOCwwLTUuNTcsMS4zOS02Ljg2LDIuNjgtMS4zOSwxLjI5LTIuNDgsMy4yOC0yLjk4LDUuMzdoMTkuMzhaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTExMjUuMzEsNTk2LjA5aDkuNzR2NDEuODRoLTkuNzR2LTQuMzdjLTQuMjcsNC45Ny05LjU0LDUuNjctMTIuNTIsNS42Ny0xMi45MiwwLTIwLjI3LTEwLjczLTIwLjI3LTIyLjI2LDAtMTMuNjIsOS4zNC0yMS45NiwyMC4zNy0yMS45NiwzLjA4LDAsOC40NS44LDEyLjQyLDUuOTZ2LTQuODdaTTExMDIuNDUsNjE3LjE2YzAsNy4yNiw0LjU3LDEzLjMyLDExLjYzLDEzLjMyLDYuMTYsMCwxMS44My00LjQ3LDExLjgzLTEzLjIycy01LjY2LTEzLjUyLTExLjgzLTEzLjUyYy03LjA2LDAtMTEuNjMsNS45Ni0xMS42MywxMy40MloiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTE1Ny40LDYwNS4wM3YzMi45aC05Ljc0di0zMi45aC00LjA3di04Ljk0aDQuMDd2LTE1LjNoOS43NHYxNS4zaDcuNDV2OC45NGgtNy40NVoiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTE3MS40MSw1OTYuMDloOS43NHYzLjc4YzEuMDktMS4yOSwyLjY4LTIuNjgsNC4wNy0zLjQ4LDEuODktMS4wOSwzLjc4LTEuMzksNS45Ni0xLjM5LDIuMzksMCw0Ljk3LjQsNy42NSwxLjk5bC0zLjk4LDguODVjLTIuMTktMS4zOS0zLjk4LTEuNDktNC45Ny0xLjQ5LTIuMDksMC00LjE3LjMtNi4wNiwyLjI5LTIuNjgsMi44OC0yLjY4LDYuODYtMi42OCw5LjY0djIxLjY2aC05Ljc0di00MS44NFoiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTI0NC45NSw2MTcuMDZjMCwxMi44Mi05Ljc0LDIyLjE2LTIyLjM2LDIyLjE2cy0yMi4zNi05LjM0LTIyLjM2LTIyLjE2LDkuNzQtMjIuMDYsMjIuMzYtMjIuMDYsMjIuMzYsOS4xNCwyMi4zNiwyMi4wNlpNMTIzNS4wMSw2MTcuMTZjMC05LjU0LTYuMjYtMTMuNDItMTIuNDItMTMuNDJzLTEyLjQyLDMuODgtMTIuNDIsMTMuNDJjMCw4LjA1LDQuNzcsMTMuMzIsMTIuNDIsMTMuMzJzMTIuNDItNS4yNywxMi40Mi0xMy4zMloiLz4KICAgIDwvZz4KICAgIDxnPgogICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xMzAxLjUxLDU5Mi43NGMtLjQ5LDEuMjItMi4zNSw1LjEzLTguMDksNS4xMy0yLjY2LDAtNC42Ny0uNzYtNi4zLTIuMzItMS44Mi0xLjcxLTIuNTgtMy44My0yLjU4LTYuNDIsMC0zLjI2LDEuMzMtNS4yOCwyLjUxLTYuNDUsMS45NC0xLjksNC4yMS0yLjMyLDYuMTktMi4zMiwzLjM0LDAsNS4yOCwxLjMzLDYuNDIsMi43LDEuNzUsMi4wOSwxLjk3LDQuNjcsMS45Nyw2LjQ1di4zOGgtMTIuM2MwLC45OS4yNywyLjA1LjgsMi43Ny40OS42OCwxLjUyLDEuNTYsMy4zLDEuNTZzMy4wNy0uODMsMy44My0yLjE2bDQuMjUuNjhaTTEyOTcuMjUsNTg2LjkzYy0uMzgtMi4yNC0yLjItMy4zLTMuOTEtMy4zcy0zLjQ5LDEuMS0zLjg3LDMuM2g3Ljc4WiIvPgogICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xMzE0LjE0LDU4NC44MWMtMS4xLTEuMDItMi4yLTEuMS0yLjctMS4xLTEuMSwwLTEuNzguNTMtMS43OCwxLjMzLDAsLjQyLjE5LDEuMDYsMS40OCwxLjQ4bDEuMS4zNGMxLjI5LjQyLDMuMjMsMS4wNiw0LjE4LDIuMzUuNDkuNjguODMsMS42Ny44MywyLjczLDAsMS40OC0uNDksMi45Ni0xLjgyLDQuMTgtMS4zMywxLjIxLTIuOTIsMS43NS00Ljk0LDEuNzUtMy40MiwwLTUuMzUtMS42My02LjM4LTIuNzNsMi40My0yLjgxYy45MSwxLjA2LDIuMjgsMS45LDMuNjQsMS45LDEuMjksMCwyLjI4LS42NCwyLjI4LTEuNzgsMC0xLjAzLS44My0xLjQ0LTEuNDQtMS42N2wtMS4wNi0uMzhjLTEuMTgtLjQyLTIuNTQtLjk1LTMuNTMtMS45Ny0uNzYtLjgtMS4yNS0xLjgyLTEuMjUtMy4xNSwwLTEuNTkuNzYtMi45MiwxLjcxLTMuNzIsMS4yOS0xLjAzLDIuOTYtMS4xOCw0LjI5LTEuMTgsMS4yMSwwLDMuMTUuMTUsNS4yNCwxLjc1bC0yLjI4LDIuNjlaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTEzMjUuMTUsNTg0Ljg0djEyLjQ5aC00LjYzdi0xMi40OWgtMS44MnYtMy45NWgxLjgydi01LjYyaDQuNjN2NS42MmgzLjE5djMuOTVoLTMuMTlaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTEzMzMuMzUsNTkxLjkxYzEuNjcsMCwyLjk2LDEuMjksMi45NiwyLjk2cy0xLjI5LDIuOTYtMi45NiwyLjk2LTIuOTYtMS4yOS0yLjk2LTIuOTYsMS4yOS0yLjk2LDIuOTYtMi45NloiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTM1NS42Myw1NzYuMjZoLTMuNjV2LTQuMjVoOC41OHYyNS4zMmgtNC45NHYtMjEuMDdaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTEzNzAuODEsNTk2LjA4bDYuMDQtNy45Yy0uOC4yNy0xLjc4LjQ5LTIuNjkuNDktMS43OCwwLTQuMDYtLjcyLTUuNTQtMi4xNi0xLjMzLTEuMjUtMi4zOS0zLjQyLTIuMzktNi4wOCwwLTIuMTMuNjEtNC4yNSwyLjMxLTYuMTEsMi4xNi0yLjM1LDQuNjMtMi44OCw3LjIxLTIuODhzNS4xMy40OSw3LjIxLDIuNThjMS4zNywxLjM3LDIuNDcsMy4zLDIuNDcsNi4xNSwwLDMuMDctMS40LDUuNTQtMy4xOSw3LjlsLTcuNDQsOS45NS0zLjk5LTEuOTRaTTEzNzIuNTIsNTc2LjY4Yy0uNjEuNjEtMS4zNywxLjY3LTEuMzcsMy4zNCwwLDEuNTIuNTMsMi42NiwxLjQsMy40OS45NS45MSwyLjAxLDEuMjEsMy4yNiwxLjIxLDEuMzcsMCwyLjM5LS40MiwzLjMtMS4zNy45MS0uOTUsMS4zNy0yLjAxLDEuMzctMy4zLDAtMS42LS42NC0yLjctMS40LTMuNDItLjY0LS42MS0xLjc1LTEuMjUtMy4yNy0xLjI1cy0yLjY2LjY0LTMuMywxLjI5WiIvPgogICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xMzg4LjQyLDU4NC42NWMwLTguNjksNC43NS0xMy4yMSw5Ljc5LTEzLjIxczkuNzksNC41Miw5Ljc5LDEzLjI1LTQuNzQsMTMuMjEtOS43OSwxMy4yMS05Ljc5LTQuNTItOS43OS0xMy4yNVpNMTM5My4zNSw1ODQuNjVjMCw2LjYxLDIuNyw5LDQuODYsOXM0Ljg2LTIuMzksNC44Ni05LTIuNzMtOC45Ni00Ljg2LTguOTYtNC44NiwyLjM5LTQuODYsOC45NloiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTQyNy43LDU5MC40MmMwLDQuMTgtMy4zNCw3LjQ4LTguODEsNy40OHMtOC44MS0zLjMtOC44MS03LjQ4YzAtMi45MiwxLjcxLTUuMzksNC41Mi02LjMtMS45NC0uOTUtMy42NS0yLjgxLTMuNjUtNS42MiwwLTMuNjgsMi42Ni03LjA2LDcuOTQtNy4wNnM3LjkzLDMuMzgsNy45Myw3LjA2YzAsMi44MS0xLjcxLDQuNjctMy42NSw1LjYyLDIuODEuOTEsNC41MiwzLjM4LDQuNTIsNi4zWk0xNDIyLjc3LDU5MC4wOGMwLTIuMzEtMS42Ny0zLjk1LTMuODctMy45NXMtMy44NywxLjYzLTMuODcsMy45NSwxLjY3LDMuOTUsMy44NywzLjk1LDMuODctMS42MywzLjg3LTMuOTVaTTE0MjIuNDMsNTc4LjU0YzAtMi4wOS0xLjQ0LTMuNTMtMy41My0zLjUzcy0zLjUzLDEuNDQtMy41MywzLjUzLDEuNDQsMy41MywzLjUzLDMuNTMsMy41My0xLjQ0LDMuNTMtMy41M1oiLz4KICAgIDwvZz4KICA8L2c+Cjwvc3ZnPg=='
  const hdr=(title)=>'<div class="H"><div class="H-top"><img class="H-logo" src="'+LOGO+'" alt=""><span class="H-stamp">Stampato il '+now+'</span></div><div class="H-bot"><span class="rt">'+title+'</span><span class="wl">'+wl+'</span></div></div>';

  if(type==='titolo'){
    html=hdr('Programmazione per Titolo — Cinema Multisala Teatro Mendrisio');
    html+='<div class="T-cols">';
    [...S.films].sort((a,b)=>a.title.localeCompare(b.title,'it')).forEach(function(f){
      const fS=allShows.filter(s=>s.filmId===f.id);if(!fS.length)return;
      const meta=[f.distributor,f.duration?durFmt(f.duration):'',f.rating,f.genre].filter(Boolean).join(' \u00b7 ');
      html+='<div class="T-film"><div class="T-film-head"><span class="T-ftit">'+f.title+'</span><span class="T-fmeta">'+meta+'</span></div>';
      fS.forEach(function(s){
        const di=wd.indexOf(s.day);
        html+='<div class="T-row"><span class="T-d">'+(di>=0?DAB[di]+' '+fd(days[di]):'')+'</span><span class="T-s">'+sn(s.sala)+'</span><span class="T-t">'+s.start+'</span><span class="T-e">fine '+s.end+'</span></div>';
      });
      html+='</div>';
    });
  }
  else if(type==='sala'){
    html=hdr('Programmazione per Sala — Cinema Multisala Teatro Mendrisio');
    html+='<div class="S-cols">';
    ['1','2','3','4'].forEach(function(sid){
      const sS=allShows.filter(s=>s.sala==sid);
      html+='<div class="S-block"><div class="S-head"><span class="S-htit">'+sid+' — '+sn(sid)+'</span><span class="S-hline"></span></div>';
      sS.forEach(function(s){
        const film=S.films.find(f=>f.id===s.filmId),di=wd.indexOf(s.day);
        const ds=di>=0?DAB[di]+' '+String(days[di].getDate()).padStart(2,'0')+'/'+String(days[di].getMonth()+1).padStart(2,'0'):'';
        html+='<div class="S-row">'
          +'<span class="S-e">'+ds+'</span>'
          +'<span class="S-t">'+s.start+'</span>'
          +'<span style="font-weight:600">'+(film?film.title:'?')+'</span>'
          +'<span class="S-dur">'+(film&&film.duration?durFmt(film.duration):'')+'</span>'
          +'<span class="S-e">'+s.end+'</span></div>';
      });
      html+='</div>';
    });
    html+='</div>';
  }
  else if(type==='giorno'){
    html=hdr('Programmazione Giornaliera — Cinema Multisala Teatro Mendrisio');
    html+='<div class="cols">';
    days.forEach(function(d,di){
      const ds=toLocalDate(d);
      const dS=allShows.filter(s=>s.day===ds);if(!dS.length)return;
      html+='<div class="G-block">';
      html+='<div class="G-chapter"><span class="G-day">'+DIT[di]+' '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'</span><span class="G-line"></span></div>';
      dS.forEach(function(s){
        const film=S.films.find(f=>f.id===s.filmId);
        html+='<div class="G-row">'
          +'<span class="G-t">'+s.start+'</span>'
          +'<span class="G-s">'+sn(s.sala)+'</span>'
          +'<span style="font-weight:600">'+(film?film.title:'?')+'</span>'
          +'<span class="G-dur">'+(film&&film.duration?durFmt(film.duration):'')+'</span>'
          +'<span class="G-e">'+s.end+'</span></div>';
      });
      html+='</div>';
    });
    html+='</div>';
  }
  else if(type==='cards-poster'){
    // Formato poster 70x100 cm — schede film grandi, griglia 4 colonne
    const posterCSS=`
      @page{size:700mm 1000mm;margin:14mm;}
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;background:#fff;line-height:1.3;}
      h1{font-size:22px;font-weight:900;margin-bottom:4px;color:#111;}
      .sub{font-size:13px;color:#777;margin-bottom:14px;}
      .poster-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
      .film-card{border:1px solid #e0e0e0;border-top:4px solid #f0801a;border-radius:5px;overflow:hidden;break-inside:avoid;page-break-inside:avoid;}
      .fc-header{padding:8px 10px 6px;border-bottom:1px solid #eee;}
      .fc-title{font-size:15px;font-weight:800;line-height:1.3;color:#f0801a;}
      .fc-meta{font-size:10px;color:#aaa;margin-top:3px;line-height:1.5;}
      .fc-body{padding:6px 10px;}
      .fc-day{display:flex;align-items:baseline;gap:6px;margin-bottom:4px;}
      .fc-day-name{font-size:10px;font-weight:700;text-transform:uppercase;color:#555;min-width:72px;}
      .fc-slots{display:flex;flex-wrap:wrap;gap:4px;}
      .fc-slot{display:inline-flex;align-items:center;gap:3px;background:#fff8f0;border:1px solid #f0c080;border-radius:3px;padding:2px 6px;}
      .fc-slot-time{font-size:11px;font-weight:700;color:#333;}
      .fc-slot-sala{font-size:9px;color:#999;}
      .poster-header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #f0801a;padding-bottom:10px;margin-bottom:16px;}
      .cinema-name{font-size:13px;color:#999;}
    `;
    html='<!DOCTYPE html><html><head><meta charset="UTF-8"><style>'+posterCSS+'</style></head><body>';
    const wd2p=wdates();const daysp=wdays();
    html+='<div class="poster-header">';
    html+='<div><h1>Programmazione Settimanale</h1>';
    html+='<div class="sub">'+fd(daysp[0])+' — '+fd(daysp[6])+'</div></div>';
    html+='<div class="cinema-name">Cinema Multisala<br>Teatro Mendrisio</div>';
    html+='</div>';
    html+='<div class="poster-grid">';
    [...S.films].sort((a,b)=>a.title.localeCompare(b.title,'it')).forEach(function(f){
      const fS=allShows.filter(s=>s.filmId===f.id);if(!fS.length)return;
      const meta=[f.distributor,f.duration?durFmt(f.duration):'',f.rating].filter(Boolean).join(' · ');
      const byDay={};
      fS.forEach(function(s){if(!byDay[s.day])byDay[s.day]=[];byDay[s.day].push(s);});
      html+='<div class="film-card">'
        +'<div class="fc-header"><div class="fc-title">'+f.title+'</div><div class="fc-meta">'+meta+'</div></div>'
        +'<div class="fc-body">';
      Object.keys(byDay).sort().forEach(function(ds){
        const di=wd2p.indexOf(ds);
        const dayLabel=di>=0?dayShort(ds,daysp,wd2p):'?';
        html+='<div class="fc-day"><span class="fc-day-name">'+dayLabel+'</span><div class="fc-slots">';
        byDay[ds].sort((a,b)=>a.start.localeCompare(b.start)).forEach(function(s){
          html+='<span class="fc-slot"><span class="fc-slot-time">'+s.start+'</span><span class="fc-slot-sala">'+sn(s.sala)+'</span></span>';
        });
        html+='</div></div>';
      });
      html+='</div></div>';
    });
    html+='</div></body></html>';
    const blobP=new Blob([html],{type:'text/html;charset=utf-8'});
    const urlP=URL.createObjectURL(blobP);
    const aP=document.createElement('a');
    aP.href=urlP;
    aP.download='programmazione-poster-70x100-'+wdates()[0]+'.html';
    document.body.appendChild(aP);aP.click();document.body.removeChild(aP);
    setTimeout(()=>URL.revokeObjectURL(urlP),5000);
    toast('Poster 70×100 cm generato — apri e stampa con Cmd+P','ok');
    return;
  }
  else if(type==='compatto'){
    html=hdr('Programma Settimanale — Cinema Multisala Teatro Mendrisio');
    html+='<div class="cols">';
    days.forEach(function(d,di){
      const ds=toLocalDate(d);
      const dS=allShows.filter(s=>s.day===ds);if(!dS.length)return;
      html+='<div class="D-chapter"><span class="D-day">'+DIT[di]+' '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'</span><span class="D-line"></span></div>';
      dS.forEach(function(s){
        const film=S.films.find(f=>f.id===s.filmId);
        html+='<div class="D-row"><span class="D-t">'+s.start+'</span><span class="D-s">'+sn(s.sala)+'</span><span class="D-f">'+(film?film.title:'?')+'</span><span class="D-d">'+(film&&film.duration?durFmt(film.duration):'')+'</span></div>';
      });
    });
    html+='</div>';
  }
  else if(type==='cartelli'){
    html='<style>@page{size:A4 landscape;margin:12mm;}</style>'+hdr('Cartelli Film — Cinema Multisala Teatro Mendrisio');
    const filmIds=[...new Set(allShows.map(s=>s.filmId))];
    filmIds.forEach(function(fid){
      const film=S.films.find(f=>f.id===fid);
      const fS=allShows.filter(s=>s.filmId===fid);
      if(!film||!fS.length)return;
      const meta=[film.distributor,film.duration?durFmt(film.duration):'',film.rating||'',film.genre].filter(Boolean).join(' · ');
      // byDay includes ALL shows for this film (not just current week)
      const byDay={};
      S.shows.filter(function(s){return s.filmId===fid;}).forEach(function(s){if(!byDay[s.day])byDay[s.day]=[];byDay[s.day].push(s);});
      // Martedi e Mercoledi settimana precedente
      const prevTue=new Date(days[0]);prevTue.setDate(prevTue.getDate()-2);
      const prevWed=new Date(days[0]);prevWed.setDate(prevWed.getDate()-1);
      const allCartDays=[prevTue,prevWed].concat(days);
      const allCartDAB=['Mar','Mer'].concat(DAB);
      const dayCells=allCartDays.map(function(d,di){
        const ds=toLocalDate(d);
        const dS=byDay[ds]||[];
        const isPrev=di<2;
        const dn=allCartDAB[di]+' '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+(isPrev?' ▸':' ');
        const rows=dS.length
          ? dS.slice().sort(function(a,b){return a.start.localeCompare(b.start);}).map(function(s){return '<div class="cart-show-row"><span class="cart-show-time">'+s.start+'</span><span class="cart-show-sala">'+sn(s.sala)+'</span></div>';}).join('')
          : '<div class="cart-no-show">—</div>';
        return '<div class="cart-day-card'+(isPrev?' cart-prev-day':'')+'">'
          +'<div class="cart-day-head"><div class="cart-day-name">'+dn+'</div></div>'
          +'<div class="cart-day-body">'+rows+'</div>'
          +'</div>';
      }).join('');
      const posterHTML=film.poster
        ? '<img class="cart-poster-img" src="'+film.poster+'" alt="">'
        : '<div class="cart-poster-ph">🎬</div>';
      html+='<div class="cart-page">'
        +'<div class="cart-header"><span class="cart-title">'+film.title+'</span><span class="cart-meta">'+meta+'</span></div>'
        +'<div class="cart-left-col">'+posterHTML+'</div>'
        +'<div class="cart-right-col"><div class="cart-days-grid">'+dayCells+'</div></div>'
        +'</div>';
    });
  }


  else if(type==='cards-new'){
    const LOGO_TAG='<img class="cn-logo" src="'+LOGO+'" alt="">';
    const DAB2=['Gio','Ven','Sab','Dom','Lun','Mar','Mer'];

    function cnLayout(n){
      var cfgs=[[1,1],[1,2],[1,3],[2,2],[2,3],[2,3],[3,3],[3,3],[3,3],[2,5],[3,4],[3,4],[2,7],[3,5],[3,5],[4,5],[4,5],[4,5],[4,5],[4,5],[5,5],[5,5],[5,5],[5,5],[5,5],[5,6],[5,6],[5,6],[5,6],[5,6],[5,7],[5,7],[5,7],[5,7],[5,7]];
      var cfg=n<=35?cfgs[n-1]:cfgs[34];
      var rows=cfg[0],cols=cfg[1];
      var cellH=140/rows;
      var timePt=Math.min(72,Math.round(cellH*0.42/0.353));
      var dayPt=Math.round(timePt*0.40);
      var subPt=Math.round(timePt*0.32);
      return{rows:rows,cols:cols,timePt:timePt,dayPt:dayPt,subPt:subPt};
    }

    [...S.films].sort((a,b)=>a.title.localeCompare(b.title,'it')).forEach(function(f){
      const fS=allShows.filter(s=>s.filmId===f.id);if(!fS.length)return;
      const meta=[f.distributor,f.duration?durFmt(f.duration):'',f.rating,f.genre].filter(Boolean).join(' · ');
      const byDay={};
      fS.forEach(function(s){if(!byDay[s.day])byDay[s.day]=[];byDay[s.day].push(s);});
      const slots=[];
      Object.keys(byDay).sort().forEach(function(ds){
        const di=wd.indexOf(ds);
        const dayName=di>=0?DAB2[di]:'?';
        const dayDate=di>=0?String(days[di].getDate()).padStart(2,'0')+'/'+String(days[di].getMonth()+1).padStart(2,'0'):'';
        byDay[ds].sort((a,b)=>a.start.localeCompare(b.start)).forEach(function(s){
          slots.push({dayName:dayName,dayDate:dayDate,start:s.start,sala:sn(s.sala)});
        });
      });
      const n=slots.length;
      const lay=cnLayout(n);
      const total=lay.rows*lay.cols;
      while(slots.length<total)slots.push(null);

      const posterHTML2=f.poster
        ?'<div class="cn-poster"><img src="'+f.poster+'" alt=""></div>'
        :'<div class="cn-poster"><span class="cn-poster-ph">🎬</span></div>';

      html+='<div class="cn-page">';
      html+='<div class="cn-header">'+LOGO_TAG+'<span class="cn-cinema">Cinema Multisala Teatro Mendrisio</span></div>';
      html+='<div class="cn-body">';
      html+='<div class="cn-left">'+posterHTML2
        +'<div class="cn-title">'+f.title+'</div>'
        +'<div class="cn-meta">'+meta+'</div>'
        +'</div>';
      html+='<div class="cn-right" style="grid-template-columns:repeat('+lay.cols+',1fr);grid-template-rows:repeat('+lay.rows+',1fr)">';
      slots.slice(0,total).forEach(function(sl){
        if(sl){
          html+='<div class="cn-slot">'
            +'<div class="cn-top" style="font-size:'+lay.dayPt+'pt">'
              +'<span class="cn-day">'+sl.dayName+'</span>'
              +' <span class="cn-date">'+sl.dayDate+'</span>'
            +'</div>'
            +'<div class="cn-middle">'
              +'<span class="cn-time" style="font-size:'+lay.timePt+'pt">'+sl.start+'</span>'
              +'<span class="cn-sala" style="font-size:'+lay.subPt+'pt">'+sl.sala+'</span>'
            +'</div>'
            +'</div>';
        } else {
          html+='<div class="cn-slot cn-empty"></div>';
        }
      });
      html+='</div></div></div>';
    });
  }
  else if(type==='cards'){
    html=hdr('Programma Settimanale — Cinema Multisala Teatro Mendrisio');
    html+='<div class="cards-grid">';
    [...S.films].sort((a,b)=>a.title.localeCompare(b.title,'it')).forEach(function(f){
      const fS=allShows.filter(s=>s.filmId===f.id);if(!fS.length)return;
      const meta=[f.distributor,f.duration?durFmt(f.duration):'',f.rating,f.genre].filter(Boolean).join(' · ');
      // Group shows by day
      const byDay={};
      fS.forEach(function(s){
        if(!byDay[s.day])byDay[s.day]=[];
        byDay[s.day].push(s);
      });
      // Raccoglie tutti gli slot ordinati per data+orario
      const allSlots=[];
      Object.keys(byDay).sort().forEach(function(ds){
        const di=wd.indexOf(ds);
        const dayName=di>=0?DAB[di]:'?';
        const dayDate=di>=0?String(days[di].getDate()).padStart(2,'0')+'/'+String(days[di].getMonth()+1).padStart(2,'0'):'';
        byDay[ds].forEach(function(s){
          allSlots.push({dayName,dayDate,start:s.start,sala:sn(s.sala)});
        });
      });
      // Riempi fino a 9 slot (griglia 3x3)
      while(allSlots.length<9)allSlots.push(null);
      html+='<div class="film-card">'
        +'<div class="fc-header"><div class="fc-title">'+f.title+'</div><div class="fc-meta">'+meta+'</div></div>'
        +'<div class="fc-body">';
      allSlots.slice(0,9).forEach(function(sl){
        if(sl){
          html+='<div class="fc-slot-block">'
            +'<div class="fc-slot-day">'+sl.dayName+'</div>'
            +'<div class="fc-slot-date">'+sl.dayDate+'</div>'
            +'<div class="fc-slot-time">'+sl.start+'</div>'
            +'<div class="fc-slot-sala">'+sl.sala+'</div>'
            +'</div>';
        } else {
          html+='<div class="fc-slot-block" style="opacity:.15"><div class="fc-slot-day">—</div></div>';
        }
      });
      html+='</div></div>';
    });
    html+='</div>';
  }


  // ── Genera il PDF tramite Blob URL (non richiede popup) ──
  const pageOverride=type==='cartelli'?'<style>@page{size:A4 landscape!important;margin:12mm;}body{width:277mm;}</style>':landscape?'<style>@page{size:A4 landscape!important;margin:12mm;}body{width:277mm;}</style>':'';
  const fullHTML='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+CN+'</title>'+PDF_STYLE+pageOverride+'</head><body>'+html+'</body></html>';
  const blob=new Blob([fullHTML],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  // Use download attribute to avoid popup blocker
  const typeNames={titolo:'per-titolo',sala:'per-sala',giorno:'giornaliero',
    cartelli:'cartelli',compatto:'compatto',cards:'schede'};
  const wd2=wdates();
  const fname='programmazione-'+(typeNames[type]||type)+(landscape?'-orizzontale':'')+'-'+wd2[0]+'.html';
  a.download=fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(url);},10000);
  toast('PDF in download — apri il file e usa Cmd+P per stampare','ok');
}
window.pPDF=pPDF;

// ── BOOKING PDF helper ────────────────────────────────────
function buildBookCard(b,type,today){
  var isOA=type==='openair';
  var accent=isOA?'#0d5c8a':'#e84a4a';
  var linkedFilm=b.filmId?S.films.find(function(f){return f.id===b.filmId;}):null;
  var filmName=linkedFilm?linkedFilm.title:(b.oaFilmTitle||'');
  var displayName=isOA&&filmName?filmName:b.name;
  var upDates=(b.dates||[]).filter(function(d){return d.date>=(today||'');}).slice(0,6);
  var allDates=b.dates||[];
  var showDates=upDates.length?upDates:allDates.slice(0,4);
  var card='<div class="bk-card" style="border-top:3px solid '+accent+'">';
  card+='<div class="bk-head" style="background:'+accent+'11">';
  card+='<div class="bk-type" style="color:'+accent+'">'+(isOA?(b.postazione||'CineTour Open Air'):(type||'evento').toUpperCase())+'</div>';
  card+='<div class="bk-name">'+displayName+'</div>';
  if(isOA&&b.location)card+='<div class="bk-sub">'+b.location+'</div>';
  if(!isOA&&b.contact)card+='<div class="bk-sub">'+b.contact+'</div>';
  card+='</div><div class="bk-body">';
  if(b.seats)card+=b.seats+' posti riservati<br>';
  if(b.oaDistributor)card+=b.oaDistributor+'<br>';
  if(isOA&&linkedFilm&&linkedFilm.distributor)card+=linkedFilm.distributor+'<br>';
  showDates.forEach(function(d){
    var p=d.date.split('-');
    card+=p[2]+'/'+p[1]+' '+d.start+(d.end?' - '+d.end:'')+'<br>';
  });
  if(allDates.length>showDates.length)card+='<span style="color:#aaa;font-size:10px">+ altre '+(allDates.length-showDates.length)+' date</span><br>';
  if(b.note)card+=b.note;
  card+='</div></div>';
  return card;
}
function pPDFBook(type){
  var days=wdays();var wd=wdates();
  var today=toLocalDate(new Date());
  var curMonth=today.slice(0,7);
  var CN='Cinema Multisala Teatro Mendrisio';
  var books=S.bookings||[];
  var title='';
  if(type==='book-week'){
    title='Prenotazioni -- '+fd(days[0])+' / '+fd(days[6]);
    books=books.filter(function(b){return(b.dates||[]).some(function(d){return wd.includes(d.date);});});
  } else if(type==='book-oa'){
    title='CineTour Open Air -- Stagione Completa';
    books=books.filter(function(b){return b.type==='openair';});
  } else if(type==='book-future'){
    title='Prossimi Eventi';
    books=books.filter(function(b){return(b.dates||[]).some(function(d){return d.date>=today;});});
  } else if(type==='book-month'){
    var mLabel=new Date().toLocaleDateString('it-IT',{month:'long',year:'numeric'});
    title='Prenotazioni '+mLabel.charAt(0).toUpperCase()+mLabel.slice(1);
    books=books.filter(function(b){return(b.dates||[]).some(function(d){return d.date.slice(0,7)===curMonth;});});
  }
  books.sort(function(a,b2){
    var aD=(a.dates||[{date:'9999'}]).map(function(d){return d.date;}).sort()[0];
    var bD=(b2.dates||[{date:'9999'}]).map(function(d){return d.date;}).sort()[0];
    return aD>bD?1:-1;
  });
  var BTYPE={openair:'CineTour Open Air',privato:'Evento Privato',compleanno:'Compleanno / Ricorrenza',scolastica:'Proiezione Scolastica',ricorrente:'Evento Ricorrente'};
  var css='@page{size:A4 portrait;margin:15mm;}body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;}.hdr{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:14px;}.hdr-title{font-size:16px;font-weight:700;}.hdr-sub{font-size:11px;color:#555;}.bk-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}.bk-card{border:1px solid #ddd;border-radius:6px;overflow:hidden;break-inside:avoid;}.bk-head{padding:8px 12px;}.bk-type{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;}.bk-name{font-size:13px;font-weight:700;color:#111;margin-bottom:1px;}.bk-sub{font-size:11px;color:#555;}.bk-body{padding:7px 12px;border-top:1px solid #eee;font-size:11px;color:#444;line-height:1.8;}.bk-sect{font-size:12px;font-weight:700;color:#333;border-left:3px solid #e84a4a;padding-left:8px;margin:14px 0 8px;}';
  var dateStr=new Date().toLocaleDateString('it-IT');
  var html='<!DOCTYPE html><html><head><meta charset="utf-8"><style>'+css+'</style></head><body>';
  html+='<div class="hdr"><div><div class="hdr-title">'+title+'</div><div class="hdr-sub">'+CN+'</div></div><div class="hdr-sub">'+dateStr+'</div></div>';
  if(type==='book-future'){
    ['openair','privato','compleanno','scolastica','ricorrente'].forEach(function(t){
      var tBooks=books.filter(function(b){return b.type===t;});
      if(!tBooks.length)return;
      html+='<div class="bk-sect">'+(BTYPE[t]||t)+'</div><div class="bk-grid">';
      tBooks.forEach(function(b){html+=buildBookCard(b,t,today);});
      html+='</div>';
    });
  } else {
    html+='<div class="bk-grid">';
    books.forEach(function(b){html+=buildBookCard(b,b.type,today);});
    html+='</div>';
  }
  html+='</body></html>';
  var blob=new Blob([html],{type:'text/html;charset=utf-8'});
  var u=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=u;
  a.download='prenotazioni-'+type+'-'+toLocalDate(new Date())+'.html';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(u);},10000);
  toast('PDF in download — apri il file e usa Cmd+P per stampare','ok');
}
window.pPDFBook=pPDFBook;window.buildBookCard=buildBookCard;




// ── EMAIL ─────────────────────────────────────────────────

// Mail tab navigation
function gMailTab(t){
  if(t==='dist'){const wd=wdates();const days=wdays();const f=document.getElementById('dist-week-from');const tEl=document.getElementById('dist-week-to');if(f&&!f.value)f.value=wd[0];if(tEl&&!tEl.value)tEl.value=wd[6];const s=document.getElementById('dist-subj');if(s&&!s.value.includes(' — '))s.value='Programmazione dei vostri film — Cinema Multisala Teatro Mendrisio — '+fd(days[0])+' / '+fd(days[6]);}
  ['gen','dist','media'].forEach(x=>{
    document.getElementById('mtab-'+x).classList.toggle('on',x===t);
    document.getElementById('mtab-'+x+'-content').style.display=x===t?'block':'none';
  });
}
window.gMailTab=gMailTab;

// ── Destinatari generali ──
async function addMail(){
  const v=document.getElementById('ne').value.trim();
  if(!v||!v.includes('@')){toast('Email non valida','err');return;}
  if(S.emails.includes(v)){toast('Già presente','err');return;}
  S.emails.push(v);document.getElementById('ne').value='';
  await fbSE(S.emails);rem();toast('Aggiunta','ok');
}
async function remMail(e){S.emails=S.emails.filter(x=>x!==e);await fbSE(S.emails);rem();}
function rem(){
  const w=document.getElementById('el');
  if(!S.emails.length){w.innerHTML='<div style="color:var(--txt2);text-align:center;padding:10px;font-size:12px">Nessun destinatario</div>';return;}
  w.innerHTML=S.emails.map(e=>`<div class="ei"><span>📧 ${e}</span><button class="btn bd bs" onclick="remMail('${e}')">✕</button></div>`).join('');
}
function sendMail(){
  if(!S.emails.length){toast('Aggiungi destinatari','err');return;}
  const subj=encodeURIComponent(document.getElementById('ms').value);
  const note=document.getElementById('mn').value;
  const days=wdays();const wd=wdates();
  let shows=S.shows.filter(s=>wd.includes(s.day)).sort((a,b)=>a.day.localeCompare(b.day)||a.start.localeCompare(b.start));
  let body=`PROGRAMMAZIONE SETTIMANALE\n${fd(days[0])} - ${fd(days[6])}\n\n`;
  if(note)body+=note+'\n\n';
  body+='——————————————————————\n';
  shows.forEach(s=>{
    const film=S.films.find(f=>f.id===s.filmId),di=wd.indexOf(s.day);
    body+=`\n${di>=0?DIT[di]+' '+fs(days[di]):s.day}  |  ${s.start}-${s.end}  |  ${sn(s.sala)}  |  ${film?.title||'?'}`;
  });
  body+='\n\n——————————————————————\nInviato da CineManager';
  window.location.href=`mailto:${S.emails.join(',')}?subject=${subj}&body=${encodeURIComponent(body)}`;
  toast('Client email aperto','ok');
}
window.addMail=addMail;window.remMail=remMail;window.sendMail=sendMail;

// ── Distributori (multi-contact) ──
// S.distributors = [{name, contacts:[{email}]}, ...]

async function addDistributor(){
  const name=document.getElementById('dist-name').value.trim();
  if(!name){toast('Inserisci il nome del distributore','err');return;}
  if(!S.distributors)S.distributors=[];
  if(S.distributors.find(d=>d.name.toLowerCase()===name.toLowerCase())){toast('Distributore già presente','err');return;}
  S.distributors.push({name,contacts:[]});
  document.getElementById('dist-name').value='';
  await fbSetDoc(db,'settings','distributors',{list:S.distributors});
  renderDist();
  fillDistDropdown();
  toast(name+' aggiunto','ok');
}
async function addDistContact(){
  const sel=document.getElementById('dist-sel').value;
  const email=document.getElementById('dist-contact-email').value.trim();
  if(!sel){toast('Seleziona un distributore','err');return;}
  if(!email||!email.includes('@')){toast('Email non valida','err');return;}
  const dist=S.distributors.find(d=>d.name===sel);
  if(!dist){toast('Distributore non trovato','err');return;}
  if(!dist.contacts)dist.contacts=[];
  if(dist.contacts.find(c=>c.email===email)){toast('Email già presente','err');return;}
  dist.contacts.push({email});
  document.getElementById('dist-contact-email').value='';
  await fbSetDoc(db,'settings','distributors',{list:S.distributors});
  renderDist();toast('Contatto aggiunto','ok');
}
async function remDistContact(distName,email){
  const dist=S.distributors.find(d=>d.name===distName);
  if(!dist)return;
  dist.contacts=dist.contacts.filter(c=>c.email!==email);
  await fbSetDoc(db,'settings','distributors',{list:S.distributors});
  renderDist();
}
async function remDistributor(name){
  if(!confirm('Eliminare '+name+' e tutti i suoi contatti?'))return;
  S.distributors=S.distributors.filter(d=>d.name!==name);
  await fbSetDoc(db,'settings','distributors',{list:S.distributors});
  renderDist();fillDistDropdown();
}
function renderDist(){
  const w=document.getElementById('dist-list');
  if(!w)return;
  if(!S.distributors||!S.distributors.length){
    w.innerHTML='<div style="color:var(--txt2);text-align:center;padding:10px;font-size:12px">Nessun distributore</div>';return;
  }
  w.innerHTML=S.distributors.map(function(d){
    const contacts=d.contacts||[];
    const hasFilms=S.films.some(f=>(f.distributor||'').toLowerCase()===d.name.toLowerCase());
    const filmBadge=hasFilms?' <span style="color:var(--acc);font-size:10px">(film abbinati)</span>':'';
    const contactRows=contacts.length
      ? contacts.map(function(ct){return '<div class="ei" style="padding:5px 12px"><span style="font-size:12px">📧 '+ct.email+'</span><button class="btn bd bs" onclick="remDistContact(\''+d.name+'\',\''+ct.email+'\')">✕</button></div>';}).join('')
      : '<div style="padding:6px 12px;font-size:11px;color:var(--txt2)">Nessun contatto — aggiungine uno sopra</div>';
    return '<div style="margin-bottom:8px;background:var(--surf2);border:1px solid var(--bdr);border-radius:7px;overflow:hidden">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border-bottom:1px solid var(--bdr)">'
      +'<span style="font-weight:600">🏢 '+d.name+filmBadge+'</span>'
      +'<button class="btn bd bs" onclick="remDistributor(\''+d.name+'\')">✕</button>'
      +'</div>'+contactRows+'</div>';
  }).join('');
  // update dist-sel dropdown
  fillDistDropdown();
}
function fillDistDropdown(){
  const sel=document.getElementById('dist-sel');
  if(!sel)return;
  const cur=sel.value;
  sel.innerHTML='<option value="">— Seleziona distributore —</option>';
  (S.distributors||[]).forEach(d=>{
    const o=document.createElement('option');
    o.value=d.name;o.textContent=d.name;
    if(d.name===cur)o.selected=true;
    sel.appendChild(o);
  });
  // Also update film modal dropdown
  fillFilmDistDropdown();
}
function fillFilmDistDropdown(){
  const sel=document.getElementById('fDist');
  if(!sel)return;
  const cur=sel.value;
  sel.innerHTML='<option value="">— Nessuno —</option>';
  (S.distributors||[]).forEach(d=>{
    const o=document.createElement('option');
    o.value=d.name;o.textContent=d.name;
    if(d.name===cur)o.selected=true;
    sel.appendChild(o);
  });
}

function distGetRange(){
  const fromEl=document.getElementById('dist-week-from');
  const toEl=document.getElementById('dist-week-to');
  const from=fromEl&&fromEl.value?fromEl.value:wdates()[0];
  const to=toEl&&toEl.value?toEl.value:wdates()[6];
  // Build array of all days in range
  const days=[];
  let cur=new Date(from+'T12:00:00');
  const end=new Date(to+'T12:00:00');
  while(cur<=end){days.push(toLocalDate(cur));cur.setDate(cur.getDate()+1);}
  return{from,to,days};
}
function distSetWeek(){
  const wd=wdates();const days=wdays();
  const fromEl=document.getElementById('dist-week-from');
  const toEl=document.getElementById('dist-week-to');
  if(fromEl)fromEl.value=wd[0];
  if(toEl)toEl.value=wd[6];
  // Update subject
  const subj=document.getElementById('dist-subj');
  if(subj)subj.value='Programmazione dei vostri film — Cinema Multisala Teatro Mendrisio — '+fd(days[0])+' / '+fd(days[6]);
  previewDist();
}
window.distSetWeek=distSetWeek;
window.distGetRange=distGetRange;
function previewDist(){
  if(!S.distributors||!S.distributors.length){toast('Aggiungi distributori','err');return;}
  const days=wdays();const wd=wdates();
  const shows=S.shows.filter(s=>wd.includes(s.day));
  const box=document.getElementById('dist-preview');
  let html='';
  S.distributors.forEach(function(dist){
    const contacts=(dist.contacts||[]).map(c=>c.email);
    const distFilms=S.films.filter(f=>(f.distributor||'').toLowerCase()===dist.name.toLowerCase());
    if(!distFilms.length&&!contacts.length)return;
    const distShows=shows.filter(s=>distFilms.find(f=>f.id===s.filmId));
    html+='<div style="margin-bottom:8px;padding:8px 10px;background:var(--surf2);border:1px solid var(--bdr);border-radius:6px;font-size:11px">'
      +'<strong style="color:var(--acc)">'+dist.name+'</strong><br>'
      +'<span style="color:var(--txt2)">Contatti: '+(contacts.length?contacts.join(', '):'<em>nessuno</em>')+'</span><br>'
      +(distFilms.length?'<span style="color:var(--txt2)">Film: '+distFilms.map(f=>f.title).join(', ')+' ('+distShows.length+' spettacoli)</span>':'<span style="color:var(--red);font-size:10px">⚠ Nessun film abbinato</span>')
      +'</div>';
  });
  box.innerHTML=html||'<div style="font-size:11px;color:var(--txt2)">Nessun distributore presente</div>';
}
function buildDistBody(dist){
  const days=wdays();const wd=wdates();
  const shows=S.shows.filter(s=>wd.includes(s.day));
  const distFilms=S.films.filter(f=>(f.distributor||'').toLowerCase()===dist.name.toLowerCase());
  if(!distFilms.length)return null;
  const distShows=shows.filter(s=>distFilms.find(f=>f.id===s.filmId));
  if(!distShows.length)return null;
  const LINE='\u2014'.repeat(30);
  let body='Gentile '+dist.name+',\n\n';
  body+='di seguito la programmazione dei vostri film\n';
  body+='per la settimana '+fd(days[0])+' - '+fd(days[6])+':\n';
  body+='\n'+LINE+'\n';
  distFilms.forEach(function(film){
    const fShows=distShows.filter(s=>s.filmId===film.id).sort((a,b)=>a.day.localeCompare(b.day)||a.start.localeCompare(b.start));
    if(!fShows.length)return;
    const meta=[film.duration?Math.floor(film.duration/60)+'h'+String(film.duration%60).padStart(2,'0'):'',film.rating,film.genre].filter(Boolean).join(' - ');
    body+='\n'+film.title.toUpperCase();
    if(meta)body+='  ('+meta+')';
    body+='\n\n';
    const byDay={};
    fShows.forEach(s=>{if(!byDay[s.day])byDay[s.day]=[];byDay[s.day].push(s);});
    Object.keys(byDay).sort().forEach(function(ds){
      const di=wd.indexOf(ds);
      const dayLabel=di>=0?DIT[di]+' '+fs(days[di]):ds;
      const times=byDay[ds].map(s=>s.start+' ('+sn(s.sala)+')').join('   ');
      body+=dayLabel+':\n'+times+'\n\n';
    });
  });
  body+=LINE+'\n';
  body+='Cinema Multisala Teatro Mendrisio';
  return body;
}
async function sendDistMails(){
  if(!S.distributors||!S.distributors.length){toast('Aggiungi distributori prima','err');return;}
  const range=distGetRange();
  const subj=document.getElementById('dist-subj').value||'Programmazione dei vostri film';

  // Costruisce lista distributori con email e corpo email
  const queue=[];
  for(const dist of S.distributors){
    const contacts=(dist.contacts||[]).map(function(c){return c.email;}).filter(Boolean);
    if(!contacts.length)continue;
    const body=buildDistBody(dist,range);
    if(!body)continue;
    queue.push({name:dist.name,emails:contacts,subject:subj,body:body});
  }

  if(!queue.length){
    toast('Nessun film in programmazione per i distributori con contatti nel periodo selezionato','ok');
    return;
  }

  // Apre il modale sequenziale
  openDistMailModal(queue,0);
}
window.sendDistMails=sendDistMails;

// Stato modale
var _distMailQueue=[];
var _distMailIdx=0;

function openDistMailModal(queue,idx){
  _distMailQueue=queue;
  _distMailIdx=idx;
  renderDistMailModal();
  document.getElementById('ovDistMail').classList.add('on');
}
window.openDistMailModal=openDistMailModal;

function renderDistMailModal(){
  var q=_distMailQueue;
  var idx=_distMailIdx;
  var total=q.length;
  var item=q[idx];
  if(!item)return;

  // Contatore
  document.getElementById('dm-counter').textContent=(idx+1)+' di '+total;
  document.getElementById('dm-progress').style.width=Math.round((idx+1)/total*100)+'%';

  // Info distributore
  document.getElementById('dm-dist-name').textContent=item.name;
  document.getElementById('dm-dist-email').textContent=item.emails.join(', ');

  // Anteprima corpo email (primi 300 char)
  var preview=item.body.slice(0,400)+(item.body.length>400?'\n[...]':'');
  document.getElementById('dm-preview').textContent=preview;

  // Pulsanti navigazione
  var prevBtn=document.getElementById('dm-prev');
  var nextBtn=document.getElementById('dm-next');
  prevBtn.style.display=idx>0?'inline-flex':'none';
  nextBtn.textContent=idx<total-1?'Prossimo →':'✓ Fine';
  nextBtn.style.background=idx<total-1?'':'var(--acc)';
  nextBtn.style.color=idx<total-1?'':'#000';
}
window.renderDistMailModal=renderDistMailModal;

function dmOpenEmail(){
  var item=_distMailQueue[_distMailIdx];
  if(!item)return;
  var mailto='mailto:'+item.emails.join(',');
  mailto+='?subject='+encodeURIComponent(item.subject);
  mailto+='&body='+encodeURIComponent(item.body);
  window.location.href=mailto;
  // Marca come aperta
  document.getElementById('dm-open-btn').textContent='✓ Aperta';
  document.getElementById('dm-open-btn').style.background='rgba(74,232,122,.2)';
  document.getElementById('dm-open-btn').style.color='#4ae87a';
  document.getElementById('dm-open-btn').style.borderColor='rgba(74,232,122,.4)';
}
window.dmOpenEmail=dmOpenEmail;

function dmNext(){
  var total=_distMailQueue.length;
  if(_distMailIdx>=total-1){
    // Fine — chiudi modale
    document.getElementById('ovDistMail').classList.remove('on');
    toast(_distMailQueue.length+' email gestite','ok');
    return;
  }
  _distMailIdx++;
  // Reset pulsante "Apri"
  var btn=document.getElementById('dm-open-btn');
  btn.textContent='📧 Apri nel client email';
  btn.style.background='';btn.style.color='';btn.style.borderColor='';
  renderDistMailModal();
}
window.dmNext=dmNext;

function dmPrev(){
  if(_distMailIdx<=0)return;
  _distMailIdx--;
  var btn=document.getElementById('dm-open-btn');
  btn.textContent='📧 Apri nel client email';
  btn.style.background='';btn.style.color='';btn.style.borderColor='';
  renderDistMailModal();
}
window.dmPrev=dmPrev;



function circSetWeek(){var wd=wdates();var f=document.getElementById('circ-from-date');var t=document.getElementById('circ-to-date');if(f)f.value=wd[0];if(t)t.value=wd[6];}
window.circSetWeek=circSetWeek;
function previewCircolare(){
  var el=document.getElementById('circ-preview');if(!el)return;
  if(!S.distributors||!S.distributors.length){el.innerHTML='<span style="color:var(--red)">Nessun distributore</span>';return;}
  var emails=[];S.distributors.forEach(function(d){(d.contacts||[]).forEach(function(ct){if(ct.email&&emails.indexOf(ct.email)<0)emails.push(ct.email);});});
  var from=(document.getElementById('circ-from')||{value:''}).value||'(non impostato)';
  var fd2=(document.getElementById('circ-from-date')||{value:''}).value;
  var td2=(document.getElementById('circ-to-date')||{value:''}).value;
  var pl=(fd2&&td2)?(fd2.split('-').reverse().join('/')+' → '+td2.split('-').reverse().join('/')):'settimana corrente';
  var h='<div style="margin-bottom:5px"><strong style="color:var(--acc)">'+emails.length+'</strong> destinatari CCN</div>';
  h+='<div style="font-size:10px;color:var(--txt2);margin-bottom:4px">Da: <strong>'+from+'</strong> · '+pl+'</div>';
  h+=emails.length?'<div style="font-size:10px;color:var(--txt2);word-break:break-all;max-height:70px;overflow-y:auto">'+emails.join(', ')+'</div>':'<div style="color:var(--red);font-size:11px">Nessun contatto email</div>';
  el.innerHTML=h;
}
window.previewCircolare=previewCircolare;
function sendCircolare(){
  if(!S.distributors||!S.distributors.length){toast('Aggiungi distributori prima','err');return;}
  var emails=[];S.distributors.forEach(function(d){(d.contacts||[]).forEach(function(ct){if(ct.email&&emails.indexOf(ct.email)<0)emails.push(ct.email);});});
  if(!emails.length){toast('Nessun contatto email','err');return;}
  var fromEmail=((document.getElementById('circ-from')||{value:''}).value).trim();
  var subj=(document.getElementById('circ-subj')||{value:'Programmazione Settimanale'}).value||'Programmazione Settimanale';
  var note=((document.getElementById('circ-note')||{value:''}).value).trim();
  var fromDate=(document.getElementById('circ-from-date')||{value:wdates()[0]}).value||wdates()[0];
  var toDate=(document.getElementById('circ-to-date')||{value:wdates()[6]}).value||wdates()[6];
  var range=[];var cur=new Date(fromDate+'T12:00:00');var endD=new Date(toDate+'T12:00:00');
  while(cur<=endD){range.push(cur.toISOString().slice(0,10));cur.setDate(cur.getDate()+1);}
  var shows=S.shows.filter(function(s){return range.indexOf(s.day)>=0;});
  var SEP='─'.repeat(44);
  var lines=['CINEMA MULTISALA TEATRO MENDRISIO',''];
  lines.push('Gentili Distributori,');lines.push('');
  if(note){lines.push(note);lines.push('');}
  lines.push('di seguito la programmazione settimanale dei vostri film');
  lines.push('dal '+fromDate.split('-').reverse().join('/')+' al '+toDate.split('-').reverse().join('/'));
  lines.push('');lines.push(SEP);
  var fids=[];shows.forEach(function(s){if(fids.indexOf(s.filmId)<0)fids.push(s.filmId);});
  fids.map(function(id){return S.films.find(function(f){return f.id===id;});}).filter(Boolean)
    .sort(function(a,b){return a.title.localeCompare(b.title,'it');})
    .forEach(function(film){
      var fs2=shows.filter(function(s){return s.filmId===film.id;}).sort(function(a,b){return a.day.localeCompare(b.day)||a.start.localeCompare(b.start);});
      if(!fs2.length)return;
      var dur=film.duration?(Math.floor(film.duration/60)+'h'+String(film.duration%60).padStart(2,'0')):'';
      lines.push('');lines.push(film.title+(dur||film.rating?' ('+[dur,film.rating].filter(Boolean).join(' · ')+')':''));
      var bd={};fs2.forEach(function(s){if(!bd[s.day])bd[s.day]=[];bd[s.day].push(s);});
      Object.keys(bd).sort().forEach(function(ds){
        var d=new Date(ds+'T12:00:00');var dl=d.toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'2-digit'});
        dl=dl.charAt(0).toUpperCase()+dl.slice(1);
        var bds={};bd[ds].forEach(function(s){if(!bds[s.sala])bds[s.sala]=[];bds[s.sala].push(s.start);});
        Object.keys(bds).sort().forEach(function(sala){
          lines.push('  '+dl+' → '+bds[sala].join(' / ')+'  ('+sn(sala)+')');
        });
      });
      lines.push('');lines.push(SEP);
    });
  lines.push('');lines.push('Cinema Multisala Teatro Mendrisio');
  var body=lines.join('\n');
  var mailto='mailto:'+(fromEmail||'');
  mailto+='?bcc='+encodeURIComponent(emails.join(','));
  mailto+='&subject='+encodeURIComponent(subj);
  mailto+='&body='+encodeURIComponent(body);
  window.location.href=mailto;toast(emails.length+' destinatari CCN','ok');
}
window.sendCircolare=sendCircolare;

window.addDistributor=addDistributor;window.addDistContact=addDistContact;window.remDistContact=remDistContact;window.remDistributor=remDistributor;window.renderDist=renderDist;window.fillDistDropdown=fillDistDropdown;window.fillFilmDistDropdown=fillFilmDistDropdown;window.previewDist=previewDist;window.sendDistMails=sendDistMails;

// ── Media ──
async function addMedia(){
  const name=document.getElementById('media-name').value.trim();
  const email=document.getElementById('media-email').value.trim();
  if(!name||!email||!email.includes('@')){toast('Nome e email obbligatori','err');return;}
  if(!S.media)S.media=[];
  if(S.media.find(m=>m.email===email)){toast('Già presente','err');return;}
  S.media.push({name,email});
  document.getElementById('media-name').value='';
  document.getElementById('media-email').value='';
  await fbSetDoc(db,'settings','media',{list:S.media});
  renderMedia();toast('Media aggiunto','ok');
}
async function remMedia(email){
  S.media=S.media.filter(m=>m.email!==email);
  await fbSetDoc(db,'settings','media',{list:S.media});
  renderMedia();
}
function renderMedia(){
  const w=document.getElementById('media-list');
  if(!S.media||!S.media.length){
    w.innerHTML='<div style="color:var(--txt2);text-align:center;padding:10px;font-size:12px">Nessun media</div>';return;
  }
  w.innerHTML=S.media.map(m=>`<div class="ei"><span>📰 <strong>${m.name}</strong> — ${m.email}</span><button class="btn bd bs" onclick="remMedia('${m.email}')">✕</button></div>`).join('');
}
function genCSVLink(){
  const days=wdays();const wd=wdates();
  const shows=S.shows.filter(s=>wd.includes(s.day)).sort((a,b)=>a.day.localeCompare(b.day)||a.start.localeCompare(b.start));
  let csv='Data,Giorno,Ora,Fine,Sala,Film,Durata,Distributore\n';
  shows.forEach(s=>{
    const film=S.films.find(f=>f.id===s.filmId);
    const di=wd.indexOf(s.day);
    const dataFmt=di>=0?fs(days[di]):'';
    const giorno=di>=0?DIT[di]:'';
    const row=[dataFmt,giorno,s.start,s.end,sn(s.sala),
      '"'+(film?.title||'').replace(/"/g,'""')+'"',
      film?.duration?Math.floor(film.duration/60)+'h'+String(film.duration%60).padStart(2,'0'):'',
      '"'+(film?.distributor||'').replace(/"/g,'""')+'"'
    ].join(',');
    csv+=row+'\n';
  });
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const box=document.getElementById('csv-link-box');
  box.style.display='block';
  box.innerHTML=`<a href="${url}" download="programmazione_${fd(days[0]).replace(/\//g,'-')}.csv" style="color:var(--acc)">⬇ Scarica CSV programmazione</a><br><span style="font-size:10px;color:var(--txt2)">${shows.length} spettacoli esportati</span>`;
  toast('CSV pronto','ok');
}
async function sendMediaMails(){
  if(!S.media||!S.media.length){toast('Aggiungi media','err');return;}
  const subj=encodeURIComponent(document.getElementById('media-subj').value);
  const note=document.getElementById('media-note').value;
  const days=wdays();const wd=wdates();
  const shows=S.shows.filter(s=>wd.includes(s.day)).sort((a,b)=>a.day.localeCompare(b.day)||a.start.localeCompare(b.start));
  let body=`PROGRAMMAZIONE SETTIMANALE\nCinema Multisala Teatro Mendrisio\n${fd(days[0])} - ${fd(days[6])}\n\n`;
  if(note)body+=note+'\n\n';
  body+='——————————————\n';
  shows.forEach(s=>{
    const film=S.films.find(f=>f.id===s.filmId),di=wd.indexOf(s.day);
    body+=`\n${di>=0?DIT[di]+' '+fs(days[di]):s.day}  ${s.start}  ${sn(s.sala)}  ${film?.title||'?'}`;
  });
  body+='\n\n——————————————\nInviato da CineManager\nhttps://lucamora1970.github.io/cinemanager';
  const to=S.media.map(m=>m.email).join(',');
  window.location.href=`mailto:${to}?subject=${subj}&body=${encodeURIComponent(body)}`;
  toast('Client email aperto','ok');
}
window.addMedia=addMedia;window.remMedia=remMedia;window.genCSVLink=genCSVLink;window.sendMediaMails=sendMediaMails;



// ── OPEN AIR ─────────────────────────────────────────────
function toggleLocation(){
  const sala=document.getElementById('mSala').value;
  const isOA=sala==='OA1'||sala==='OA2';
  // Show/hide location field
  const locRow=document.getElementById('locationRow');
  if(locRow)locRow.style.display=isOA?'block':'none';
  // Hide sala row label when OA (sala already known)
  const salaRow=document.getElementById('salaRow');
  if(salaRow)salaRow.style.display=isOA?'none':'block';
  // Switch fasce buttons
  const fn=document.getElementById('fasceNormal');
  const fo=document.getElementById('fasceOA');
  if(fn)fn.style.display=isOA?'none':'flex';
  if(fo)fo.style.display=isOA?'flex':'none';
  // Pre-set time for OA
  if(isOA&&!document.getElementById('mStart').value){
    document.getElementById('mStart').value='21:00';
    syncFasce();ce();
  }
  // Hide suggestion box for OA (not relevant)
  const sb=document.getElementById('suggBox');
  if(sb)sb.style.display=isOA?'none':sb.style.display;
}
async function toggleOA(active){
  S.oaActive=active;
  await setDoc(doc(db,'settings','oa'),{active});
  renderOAToggle();renderOA();
}
function renderOAToggle(){
  const sec=document.getElementById('oa-section');
  if(sec)sec.style.display='block';
  const tog=document.getElementById('oaToggle');
  if(tog)tog.checked=S.oaActive;
}
function renderOA(){
  const body=document.getElementById('oa-body');
  if(!body)return;
  if(!S.oaActive){
    body.innerHTML='<div style="padding:12px 16px;font-size:12px;color:var(--txt2)">Attiva il toggle per gestire le proiezioni Open Air</div>';
    return;
  }
  const days=wdays();const wd=wdates();
  const oaCount=S.oaShows.filter(function(s){return wd.includes(s.day);}).length;
  const cnt=document.getElementById('oa-count');
  if(cnt){cnt.style.display=oaCount?'inline':'none';cnt.textContent=oaCount+' proiezioni';}
  const canEdit=!!currentUser;
  body.innerHTML='';
  ['OA1','OA2'].forEach(function(oaId){
    const oaInfo=OA_SALES[oaId];
    const wrap=document.createElement('div');
    wrap.style.cssText='padding:10px 16px;border-bottom:1px solid var(--bdr)';
    const head=document.createElement('div');
    head.style.cssText='font-size:12px;font-weight:700;color:var(--txt);margin-bottom:8px;display:flex;align-items:center;gap:6px';
    head.innerHTML='<span style="width:10px;height:10px;border-radius:50%;background:'+oaInfo.col+';display:inline-block"></span>'+oaInfo.n;
    wrap.appendChild(head);
    const grid=document.createElement('div');
    grid.style.cssText='display:grid;grid-template-columns:repeat(7,1fr);gap:6px';
    days.forEach(function(d,di){
      const ds=toLocalDate(d);
      const dayShow=S.oaShows.find(function(s){return s.sala===oaId&&s.day===ds;});
      const cell=document.createElement('div');
      cell.style.cssText='background:var(--surf2);border:1px solid var(--bdr);border-radius:6px;padding:6px;min-height:70px';
      const dayLabel=DIT[di].slice(0,3)+' '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');
      const dlEl=document.createElement('div');
      dlEl.style.cssText='font-size:9px;font-weight:700;color:var(--txt2);text-transform:uppercase;margin-bottom:4px';
      dlEl.textContent=dayLabel;
      cell.appendChild(dlEl);
      if(dayShow){
        const film=S.films.find(function(f){return f.id===dayShow.filmId;});
        const card=document.createElement('div');
        card.className='oa-card';
        card.onclick=function(){editShow(dayShow.id);};
        if(canEdit){
          const del=document.createElement('button');
          del.className='oa-del';del.textContent='×';
          del.onclick=function(e){e.stopPropagation();delShow(dayShow.id);};
          card.appendChild(del);
        }
        card.innerHTML+='<div class="oa-film">'+(film?film.title:'?')+'</div>'
          +'<div class="oa-location">📍 '+(dayShow.location||'')+'</div>'
          +'<div class="oa-time">'+dayShow.start+'</div>';
        cell.appendChild(card);
      } else if(canEdit){
        const add=document.createElement('div');
        add.className='oa-add';add.textContent='＋ Aggiungi';
        add.onclick=function(){openShowSlot(ds,'21:30',oaId);};
        cell.appendChild(add);
      }
      grid.appendChild(cell);
    });
    wrap.appendChild(grid);
    body.appendChild(wrap);
  });
}
window.toggleOA=toggleOA;window.toggleLocation=toggleLocation;

// ── PRENOTAZIONI ─────────────────────────────────────────
const BOOK_TYPES={openair:'CineTour Open Air',privato:'Evento Privato',compleanno:'Compleanno',scolastica:'Scolastica',ricorrente:'Ricorrente'};
let _bDates=[]; // [{date,start,end}]

function onBTypeChange(){
  const t=document.getElementById('bType').value;
  const isOA=t==='openair';
  document.getElementById('oaFields').style.display=isOA?'block':'none';
  // Nascondi sezioni generiche per OA (gestite dentro oaFields)
  const nonOaFields=['bNameRow','bContactRow','bFilmRow','bNoteRow'];
  nonOaFields.forEach(function(id){const el=document.getElementById(id);if(el)el.style.display=isOA?'none':'';});
  if(isOA){
    // Resetta radios
    const pno=document.getElementById('bOAPrenNo');if(pno)pno.checked=true;
    const sno=document.getElementById('bOAScarNo');if(sno)sno.checked=true;
    fillOAFilmDropdown();
    fillOADistDropdown();
  }
}
function fillOAFilmDropdown(){
  const sel=document.getElementById('bOAFilm');
  if(!sel)return;
  sel.innerHTML='<option value="">— Seleziona film —</option>';
  S.films.forEach(function(f){
    const o=document.createElement('option');o.value=f.id;o.textContent=f.title;sel.appendChild(o);
  });
}
function fillOADistDropdown(){
  const sel=document.getElementById('bOADistSel');
  if(!sel)return;
  sel.innerHTML='<option value="">— Seleziona —</option>';
  (S.distributors||[]).forEach(function(d){
    const o=document.createElement('option');o.value=d.name;o.textContent=d.name;sel.appendChild(o);
  });
}
function onOAFilmMode(){
  const mode=document.querySelector('input[name="bOAFilmMode"]:checked')?.value||'arch';
  document.getElementById('bOAFilm').style.display=mode==='arch'?'block':'none';
  document.getElementById('bOAFilmFree').style.display=mode==='free'?'block':'none';
  document.getElementById('bOADistRow').style.display=mode==='free'?'block':'none';
}
window.onBTypeChange=onBTypeChange;window.onOAFilmMode=onOAFilmMode;
function setBMode(mode){
  document.getElementById('bMode').value=mode;
  document.getElementById('bExistPanel').style.display=mode==='exist'?'block':'none';
  document.getElementById('bManualPanel').style.display=mode==='manual'?'block':'none';
  document.getElementById('bModeExist').style.borderColor=mode==='exist'?'var(--acc)':'var(--bdr)';
  document.getElementById('bModeExist').style.color=mode==='exist'?'var(--acc)':'var(--txt2)';
  document.getElementById('bModeManual').style.borderColor=mode==='manual'?'var(--acc)':'var(--bdr)';
  document.getElementById('bModeManual').style.color=mode==='manual'?'var(--acc)':'var(--txt2)';
  if(mode==='exist')fillBShows();
  if(mode==='manual'){fillBManualFilms();}
}
function fillBShows(){
  const sel=document.getElementById('bWeekSel').value;
  const days=sel==='next'?wdays().map(function(d){const nd=new Date(d);nd.setDate(nd.getDate()+7);return nd;}):wdays();
  const wd=days.map(function(d){return toLocalDate(d);});
  const shows=S.shows.filter(function(s){return wd.includes(s.day);});
  const films=[...new Set(shows.map(function(s){return s.filmId;}))];
  const fsel=document.getElementById('bFilmSel');
  fsel.innerHTML='<option value="">— Seleziona film —</option>';
  films.forEach(function(fid){
    const film=S.films.find(function(f){return f.id===fid;});
    if(!film)return;
    const o=document.createElement('option');o.value=fid;o.textContent=film.title;fsel.appendChild(o);
  });
  document.getElementById('bShowSel').innerHTML='<option value="">— Prima seleziona film —</option>';
  document.getElementById('bShowInfo').style.display='none';
}
function fillBShowTimes(){
  const fid=document.getElementById('bFilmSel').value;
  const sel=document.getElementById('bWeekSel').value;
  const days=sel==='next'?wdays().map(function(d){const nd=new Date(d);nd.setDate(nd.getDate()+7);return nd;}):wdays();
  const wd=days.map(function(d){return toLocalDate(d);});
  const shows=S.shows.filter(function(s){return wd.includes(s.day)&&s.filmId===fid;}).sort(function(a,b){return a.day.localeCompare(b.day)||a.start.localeCompare(b.start);});
  const ssel=document.getElementById('bShowSel');
  ssel.innerHTML='<option value="">— Seleziona spettacolo —</option>';
  shows.forEach(function(s){
    const di=wd.indexOf(s.day);
    const dayLabel=di>=0?DIT[di]+' '+fs(days[di]):'';
    const o=document.createElement('option');o.value=s.id;o.textContent=dayLabel+' '+s.start+' — '+sn(s.sala);ssel.appendChild(o);
  });
  document.getElementById('bShowInfo').style.display='none';
}
function onBShowSelect(){
  const sid=document.getElementById('bShowSel').value;
  if(!sid){document.getElementById('bShowInfo').style.display='none';return;}
  const show=S.shows.find(function(s){return s.id===sid;});
  if(!show)return;
  document.getElementById('bLinkedShowId').value=sid;
  const film=S.films.find(function(f){return f.id===show.filmId;});
  const info=document.getElementById('bShowInfo');
  info.style.display='block';
  info.textContent=(film?film.title:'?')+' · '+sn(show.sala)+' · '+show.start+' → '+show.end;
}
function fillBManualFilms(){
  const sel=document.getElementById('bFilmManual');
  if(!sel)return;
  sel.innerHTML='<option value="">— Nessun film specifico —</option>';
  S.films.forEach(function(f){
    const o=document.createElement('option');o.value=f.id;o.textContent=f.title;sel.appendChild(o);
  });
}

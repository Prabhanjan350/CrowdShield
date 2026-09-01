CrowdShield TRUE METRICS build

Run from a local web server for best browser/CDN behavior.

Forecast semantics:
- Density: physical p/m² only with a calibrated zone floor area; otherwise explicit visual density in p/10% frame.
- Inflow/outflow: measured anonymous-track boundary crossing rates in a rolling 10-second video-time window.
- Time-to-critical: requires a real critical occupancy. Without one, UI says SET LIMIT.
- Risk: a decision-support pressure index, not a directly measured physical quantity.

To supply venue calibration programmatically, set zone.areaM2 and zone.criticalOccupancy in the venue profile. Do not infer these from filename/video sentiment.

# CrowdShield

A privacy-first crowd safety and decision-support system that analyzes
CCTV or uploaded venue footage to detect crowd congestion, assess crowd
conditions, simulate interventions, and recommend safer crowd-management
actions.

## About the Project

CrowdShield helps venue operators identify developing crowd congestion
and decide what action to take next. Traditional CCTV primarily shows
what is happening; CrowdShield adds a decision-support layer.

**OBSERVE → FORECAST → SIMULATE → ACT**

The system anonymously detects and tracks people, assigns them to
spatial zones, evaluates crowd pressure and movement, highlights areas
requiring attention, recommends an intervention, and lets the operator
simulate the estimated effect before acting.

CrowdShield is a hackathon prototype demonstrating how browser-based
computer vision and explainable crowd analytics can support
crowd-management decisions.

## Features

-   CCTV / venue video upload and analysis
-   Anonymous person detection and tracking
-   Automatic spatial crowd-analysis zones
-   Live tracked-person counts
-   Green / yellow / red crowd-condition visualization
-   Visual crowd-pressure analysis
-   Crowd growth, inflow and outflow
-   Focus-zone and risk identification
-   Safest alternate-zone identification
-   Recommended operator actions
-   Intervention simulation
-   Current-risk vs projected-risk comparison
-   Recommendation confidence
-   Operator event timeline
-   No facial recognition or identity tracking

## Live Website

**CrowdShield:** https://crowdshield-1.netlify.app/

The deployed interface provides video upload, live video analysis, crowd
metrics, the Decision Center, recommended actions, intervention
simulation and an operator timeline.

## Recommended Demo Videos

> **Important:** For the best and most reliable demonstration of
> CrowdShield, please use the sample videos provided in the **`videos/`
> folder of this repository**.

The current prototype has been developed and tested using the footage
included in this folder. These videos are recommended for evaluating
person tracking, zone analysis, crowd risk, movement metrics,
recommendations and intervention simulation.

CrowdShield also accepts other compatible CCTV or venue videos. Because
this is a hackathon prototype using a general-purpose browser-based
detector, results may vary with camera angle, crowd density, lighting,
resolution, occlusion and video quality.

**First-time users, reviewers and judges are strongly recommended to
begin with the videos in the repository's `videos/` folder before
testing their own footage.**

## Crowd Condition Analysis

CrowdShield uses three primary crowd states:

-   **Green** --- Low or no crowd pressure
-   **Yellow** --- Moderate crowd pressure
-   **Red** --- High or very crowded conditions

These colours are dynamically calculated from current crowd conditions.
They are not permanently assigned to particular zones.

## Anonymous Person Tracking

A display such as `ZONE B · 7 people` means CrowdShield currently has
seven active anonymous person tracks assigned to Zone B using detector
and tracker evidence.

The values are not manually entered or randomly generated.

Dense crowds create an important computer-vision problem: people can
overlap and hide one another. CrowdShield therefore also considers
visual crowd-packing evidence when evaluating crowd pressure. As a
result, crowd risk can be high even when the raw tracked-person count is
lower than the actual number of people visible in a heavily occluded
scene.

## Live Analysis Metrics

### Visual Density

The concentration of detected/tracked people relative to the visible
frame, currently expressed as `people / 10% frame`. This is a
visual-density indicator, **not people per square metre**.

### Inflow

Measured rate at which anonymous tracked people move into a zone,
displayed in `people/min`.

### Outflow

Measured rate at which anonymous tracked people leave a zone, displayed
in `people/min`.

### Crowd Growth

Shows whether the tracked crowd in an area is increasing or decreasing
over time.

### Crowd Trend

A simplified interpretation of crowd movement, such as **Rising**,
**Stable**, **Easing**, or **Warming**.

### Safest Alternate Zone

Identifies another analyzed zone currently showing comparatively lower
calculated crowd risk.

### Confidence

Indicates the reliability of the current analysis based on available
detector/tracker evidence.

## Intervention Simulation

Intervention is a central CrowdShield feature. Instead of only warning
that congestion is developing, CrowdShield allows an operator to test a
possible response.

Depending on current conditions, available actions can include
maintaining current flow, redirecting people toward another zone, or
reducing flow toward a high-pressure area.

After selecting an intervention, click **Run Intervention Simulation**.

CrowdShield presents:

**Current Risk → Projected Risk**

along with an explanation of the simulated outcome.

The simulation is a **decision-support estimate** and is not a
guaranteed prediction of real-world crowd behaviour.

## How to Use CrowdShield

### 1. Open CrowdShield

Visit **https://crowdshield-1.netlify.app/** in a modern desktop
browser. Chrome or Edge is recommended for the prototype.

### 2. Wait for Initialization

Allow the browser-based computer-vision components to initialize. Some
machine-learning libraries/models are loaded from external resources, so
internet access may be required.

### 3. Use a Recommended Demo Video

For the intended demonstration, select one of the sample videos from the
repository's **`videos/` folder**.

### 4. Upload the Video

Click **Upload Video** and select the footage. You may also test your
own compatible CCTV or venue video, although results may vary.

### 5. Play and Observe

Play the footage. CrowdShield begins sampling frames, anonymously
detecting/tracking people and assigning tracks to spatial zones.

Watch the zone states change from **Green → Yellow → Red** as calculated
crowd pressure increases.

### 6. Review Live Analysis

Monitor zone person counts, crowd growth, focus-zone flow, safest
alternate zone, confidence, visual density, inflow, outflow, crowd trend
and risk score.

Time-dependent metrics can initially show a warming state because
multiple observations are required before movement trends can be
calculated.

### 7. Read the Recommended Action

The Decision Center identifies the focus zone and presents the
recommended operator action, explanation and recommendation confidence.

### 8. Test an Intervention

Select an available intervention and click **Run Intervention
Simulation**. Compare the displayed **Current Risk → Projected Risk**
and review the explanation.

### 9. Review the Operator Timeline

Use the timeline to review important events generated during the
analysis session.

## Privacy by Design

CrowdShield does **not** require facial recognition, identity
recognition, biometric identification, personal profiles or names.

The system works with anonymous person detections, temporary tracks,
zone assignments and movement information. The purpose is to understand
**crowd movement and crowd pressure**, not to identify individuals.

## Technologies Used

-   HTML
-   CSS
-   JavaScript
-   TensorFlow.js
-   COCO-SSD
-   HTML5 Canvas
-   FFmpeg.wasm
-   Browser-based computer vision

## System Workflow

``` text
Uploaded CCTV / Venue Video
            ↓
     Person Detection
            ↓
   Anonymous Tracking
            ↓
      Zone Assignment
            ↓
 Crowd Pressure Analysis
            ↓
 Flow + Trend Analysis
            ↓
       Risk Assessment
            ↓
   Recommended Action
            ↓
 Intervention Simulation
            ↓
Current Risk → Projected Risk
```

## Limitations

CrowdShield is currently a **prototype and proof-of-concept**, not a
production-certified crowd safety system.

### 1. Person Detection Accuracy

Detection accuracy can decrease with heavy overlap, small or distant
people, poor lighting, blur and visual obstruction. The tracked-person
count is therefore not a guaranteed count of every person physically
present.

### 2. Dense Crowd Occlusion

People can partially or completely block one another in dense footage.
Visual packing helps CrowdShield assess pressure when this happens, but
it does not eliminate the underlying detection limitation.

### 3. Visual Density Is Not Physical Density

The prototype does not automatically know the physical dimensions of a
venue. `people / 10% frame` must not be interpreted as `people / m²`.
Reliable physical density requires camera calibration and venue
geometry.

### 4. Camera Perspective

People nearer a camera appear larger than people farther away.
Production deployment would require perspective correction and camera
calibration.

### 5. Spatial Zones Are Not a Venue Map

The prototype analyzes regions of the video but does not automatically
understand real doors, emergency exits, barriers, staircases, restricted
areas or safe capacities. Production use would require venue-specific
configuration.

### 6. Intervention Simulation Is an Estimate

The simulator does not physically model every person's future behaviour.
Panic, confusion, signage, security instructions, barriers and
individual decisions can produce different real-world outcomes.

### 7. No Guaranteed Time-to-Danger Prediction

CrowdShield does not claim a universal fixed-seconds prediction of a
dangerous event. Reliable time-to-critical forecasting requires real
venue limits, physical measurements and venue-specific calibration.

### 8. Short Videos

Movement metrics require observations over time. Very short footage may
not provide enough evidence for stable inflow, outflow or crowd-growth
calculations.

### 9. Browser Performance

Analysis is performed in the browser. Performance varies with CPU/GPU
capability, browser, video resolution, visible crowd size and available
memory.

### 10. Video Compatibility

Video decoding support varies between browsers and operating systems.
Certain codecs or unusual formats may cause compatibility problems.

### 11. Internet Dependency

Some libraries and machine-learning resources are loaded from external
resources. An internet connection may therefore be required during
initialization.

### 12. External Videos May Produce Different Results

The **`videos/` folder** contains the recommended demonstration footage.
Other videos are supported, but results can vary significantly depending
on perspective, crowd visibility, occlusion, resolution and lighting.

### 13. Not an Emergency Safety System

CrowdShield is an experimental decision-support prototype and should
**not** be used as the sole system responsible for real-world emergency
crowd management, evacuation decisions or public safety.

## Future Improvements

-   Crowd-specific detection models
-   Multi-camera analysis
-   Perspective correction
-   Physical camera calibration
-   Density estimation in people/m²
-   Venue maps and digital twins
-   Configurable safe occupancy limits
-   Exit and route mapping
-   Historical crowd-pattern learning
-   More advanced forecasting
-   Improved intervention simulation
-   Live CCTV / RTSP stream support
-   Edge-device deployment
-   Automated operator alerts

## Project Structure

``` text
CrowdShield/
├── index.html
├── vision.js
├── intelligence.js
├── ui.js
├── app.js
├── videos/
│   └── Demo crowd footage
└── README.md
```

### `index.html`

Contains the operator interface, video viewport, forecast dashboard,
live-analysis panels, intervention controls and timeline.

### `vision.js`

Handles person detection, anonymous tracking, spatial zone assignment
and visual crowd evidence.

### `intelligence.js`

Processes observations to derive crowd conditions, movement trends, risk
and decision-support information.

### `ui.js`

Renders zone information, recommendations, intervention results and
timeline events.

### `app.js`

Coordinates video upload, model initialization, analysis timing and
communication between the vision, intelligence and UI modules.

### `videos/`

Contains the **recommended demonstration videos** for testing and
presenting CrowdShield.

## Intended Use Cases

CrowdShield demonstrates a concept that could eventually support railway
stations, stadiums, college events, cinemas, festivals, exhibitions and
other large public venues.

Real deployment would require additional validation, calibration and
safety testing.

## Built For

**Hackathon Prototype --- Crowd Safety & Decision Support**

CrowdShield demonstrates how computer vision can move crowd monitoring
beyond simply observing congestion toward:

**Observe → Forecast → Simulate → Act**

The goal is not to identify people.

The goal is to help operators understand **where crowd pressure is
developing and what action may reduce the risk.**

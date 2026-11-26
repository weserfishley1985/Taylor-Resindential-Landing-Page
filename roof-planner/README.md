# Taylor Metal Roof Planner

An interactive web application for tracing roof planes over aerial imagery, labeling roof edges, applying per-plane pitch, reviewing estimated roof area, laying out metal panels, and inspecting a 3D visualization.

## Open a plan or a saved project

Choose **Open project or plans** or drop one file onto the map. PDF, PNG, JPEG and WebP drawings open for review in the same planner. A saved project JSON restores the editable workspace. PDF reading requires internet access to load the PDF reader. Confirm dimensions and roof form, check openings against the elevations, then choose **Add building to project**. Open **Panels & 3D** to lay out panels on the reviewed geometry.

## Use the app

[Open the customer app](https://weserfishley1985.github.io/Taylor-Resindential-Landing-Page/roof-planner/)

1. Start typing an address, choose an autocomplete result, and confirm the building on the aerial map.
2. Use Auto-outline and click a building to create an editable overall-boundary snap guide, or proceed without one.
3. Draw each roof plane manually inside the outline. New corners snap to nearby outline segments, outline corners, and existing plane geometry.
4. Click a roof line to highlight it immediately, then label it ridge, hip, valley, rake, eave, or flashing. Enter field-measured feet and inches when available.
5. Set the pitch and downslope direction for every plane. Shared edges are checked against both pitched plane equations before the 3D model is trusted.
6. Choose effective panel coverage and review estimated lengths and quantities.

For a typed starting point, choose **Build by dimensions** and enter the house width, depth, wall/eave height, and pitch. It creates a centered, editable gable-house template with two connected roof planes and labeled ridge, eaves, and rakes. You can then drag the points, type individual line measurements, relabel edges, and adjust each plane just like a traced roof.

Connected roof planes share their snapped vertices. Drag a corner, the diamond edge handle, or the center move handle to refine the roof while keeping adjoining geometry connected. With **Keep connected planes snapped** enabled, nearby vertices and vertices close to an adjoining edge become shared topology within the configurable 0.5–24 inch tolerance. Geometry edits then reconcile safe nonparallel shared-edge intersections, and corners shared by three or more planes are solved as one XYZ junction. The solver preserves entered pitch and eave elevation, limits automatic horizontal movement to six feet per pass, and leaves offset, oversized, rank-deficient, or invalid constraints highlighted by plane and edge name for manual review. Predictive snapping prioritizes shared roof points, roof edges/intersections, the outline, then optional 1-foot grid recommendations; the preview shows the landing point and Auto Snap can be temporarily bypassed with Alt.

Project-file version 5 restores the complete editable session: outlines, planes, generated-building footprint and wall height, stable object IDs, roof-line labels, pitch, panel/material settings, customer and quote information, map position, workflow step, selected geometry, panel visibility, and 3D camera. Version 2 through version 4 files remain readable and are upgraded when saved again.

The live takeoff displays combined ridge, hip, valley, rake, and eave lengths. The customer-report workflow uses those same live calculations for pricing and produces print-ready quote, material, panel-layout, and full-project report options. Reports may include five 3D perspectives with the calculated panel layout; use the browser print window to save the result as PDF.

The primary 3D viewer uses WebGL. If a browser blocks WebGL, the planner automatically switches to an SVG compatibility 3D preview so the roof surfaces, walls, pitch-derived heights, and optional panel layout remain reviewable. Drag horizontally to rotate the compatibility view and scroll or pinch to zoom. It is a simplified inspection renderer and does not provide photorealistic shading or captured 3D report perspectives.

The application uses Esri aerial imagery and address autocomplete plus OpenStreetMap building footprints through the public Overpass API. It does not require a Google Maps API key. Footprint coverage and geometry vary. Automatic outlines are editable snap guides only: they are excluded from roof area, panels, cut lists, exports, and 3D calculations.

## Important limitation

**Overhangs and roof trim:** In Label edges, click an exterior Eave or Rake and choose Add eave / rake overhang. Enter additional horizontal inches (up to 48); each use adds to the existing roof geometry. Collinear connected rake edges extend together. The operation preserves each pitched surface, updates the low-edge elevation reference as needed, retains fixed wall footprints, and rejects new junction conflicts. Undo reverses the addition. Roof area, panel layouts, and existing measurement reports use the extended geometry.

Open Trim parts & quantities to enable eave trim and fascia, choose face heights, color and stock length, and review linear feet and piece counts. Fascia covers labeled Eave and Rake edges. Stock pieces round up separately per edge without lap or offcut optimization. The 3D trim shows simple faces, not manufacturer bends or fastening details. Trim choices persist in project files. Dedicated trim-part quantities are not yet included in PDF/CSV materials or quote pricing.

**Click wall tools:** Use Draw wall · Plan, click two points, and confirm length and height. The preview follows the cursor and snaps within 14 screen pixels of existing wall endpoints. Use Attach wall and click near a wall endpoint in Plan or 3D to start an addition there. Choose Place door or Place window and click a wall in either view; the compact dialog pre-fills the position and lets you enter exact opening dimensions. Escape or Cancel wall tool exits placement. In 3D, drag rotates; a stationary click selects the wall. Free wall drawing uses Plan view; 3D supports attaching a new wall to an existing wall and placing openings.

**Walls, doors & windows:** Use the new button beside Add building section. Enter a standalone wall's start X/Y, length, direction, and height, or choose an existing wall endpoint as the starting point. Select any generated or standalone wall to add measured door/window openings using width, height, distance from wall start, and sill height. Openings cut the displayed surfaces and reduce net wall area. Ordered panels remain conservative full-height blanks with cutouts. Remove openings or standalone walls in the editor; Undo restores changes. Standalone walls appear on the map and in both 3D viewers. Project-file version 6 preserves walls and openings and reads versions 2–5. Endpoint attachment sets the initial position; later roof edits do not move or reshape these walls automatically. Walls do not automatically generate extension roofs or framing. Use **Building trim** to apply opening casing.

**Wall panels:** Open **Wall layout & cut list** in the right sidebar. Set vertical-panel effective coverage in inches, maximum length in feet, end allowance in inches, color, and Show wall panels in 3D, then Apply. Counts and cut lengths are separate from roof panels and saved with the project. This first version covers gross rectangular section walls below eave height: it includes each section perimeter without shared-wall or door/window deductions and excludes gable triangles. Wall takeoffs are shown in their own dialog; existing quote/PDF and roof CSV exports do not include wall materials or pricing.

Use **Add building section** repeatedly to create Bedroom, Living room, Garage, Dining room, Den, Family room, Office, or Custom addition sections. Each has width, depth, wall/eave height, pitch, and X/Y placement measured in feet from the project origin. Each generates two editable gable roof planes and a saved rectangular wall footprint. Sections are building masses, not interior room partitions. Overlapping roof planes are not automatically trimmed into a combined roof; edit intersections before using a takeoff. Roof-point edits do not automatically reshape the stored wall footprint.

This application produces aerial estimates and editable templates, not surveys, structural calculations, code determinations, or fabrication approval. The typed house builder is a gable starter only; it does not design framing or certify wall, roof, or intersection dimensions. Automatic reconciliation first repairs only small, tolerance-bounded 2D gaps, then evaluates the mathematical pitched-plane intersections while preserving each plane’s entered pitch. It does not globally optimize arbitrary overlapping surfaces or silently alter protected measurements. Over-constrained, rank-deficient, oversized, or invalid junctions remain visibly flagged. Verify pitch and critical dimensions in the field and have the selected manufacturer or fabricator review the order before purchasing material.

## Project structure

- `dist/` — deployable static web application
- `test-geometry.mjs` — deterministic geometry and panel fixtures
- `BASELINE.md` — preserved Baseline 1.0 behavior and known limits
- `ROOF_PLANNER_ENGINEERING_STANDARD.md` — project engineering and release standard

## Local checks

```text
node --check dist/app.mjs
node --check dist/roof3d.mjs
node test-geometry.mjs
```

Serve `dist/` from an HTTP server for local browser testing. Direct `file:` loading is not supported because the application uses JavaScript modules.

## GitHub Pages

GitHub Pages publishes this folder from the `main` branch of `weserfishley1985/Taylor-Resindential-Landing-Page`. Edit the modules in `dist/` and run `node build-standalone.mjs` from `roof-planner/` to regenerate the customer-facing `index.html`. Commit source and output together. The home page of the residential site is maintained separately.

## License

No open-source license has been granted. All rights are reserved unless the repository owner adds a license later.

## Import building plans (development)

Choose **Import building plans** and select a PDF, PNG, JPEG or WebP. Digital PDFs are read locally with PDF.js 5.4.624 (Apache 2.0), loaded on demand from cdnjs, with PDF.js support resources from jsDelivr. These hosts receive library requests. The drawing bytes stay in the browser. Use a current browser with internet access to load the PDF reader. Images can be reviewed independently.

Review the building dimensions, roof form, direction, pitch and opening references. For an elevation, choose its exterior side, check the wall span and eave height, and mark the lower-left floor corner and opposite upper-right eave corner. The detector proposes rectangular openings in that view. Each opening can be edited, excluded or removed. Confirm the review before generating a building. The destination control can append to a clear area at the map center or start a new project. Undo restores the previous model.

The importer currently builds rectangular gable, single-slope and flat buildings. Unlabelled dimensions need review. Elevations must be straight-on for scaled opening measurements. Confirm rough openings, floor datum, revision marks, and panel product settings before ordering. The embedded recognition uses labelled dimensions and calibrated image geometry. It does not perform general OCR or establish cadastral registration. Walls linked to imported roof surfaces include their sloped or gable tops in 3D, net area and panel blank lengths. Imported geometry and source references reopen in the current project format. Keep the original PDF separately.

**Development checkpoint.** Base revision bd1479194cfa7eb5bbe3eb22e815e5703e0f7ad7, schema v6, tag overhang-trim-v2.2-2026-10-30. Restore that checkout to return to the previous release. Keep original v6 backups if using the older published app.


## Wall panel cut sheets

In **Panels & 3D**, open **Wall panel settings & quantities**, set the effective coverage, allowance and maximum stock length, then select **Apply wall panels & view in 3D**. Click an installed wall panel or use **Wall panel cut sheets** to select a wall and strip. Each sheet shows its order blank, fitted top, opening cutouts and edge notches with dimensions from the installed lower-left corner. Strip numbering runs from the start of each wall, including positions that fall entirely inside an opening. Each printable packet covers up to 40 installed strips. The CSV carries opening and profile coordinates in inches.

**Match lengths within 1 inch** groups blanks on each individual wall or roof plane. The longest required blank in a group is at most one inch longer than the shortest, before rounding. Each group orders the longest blank rounded up to a whole inch. A blank within the stock limit stays within that limit. Strip locations, installed profiles and opening dimensions remain the field-cut reference. The order includes full-height blanks around openings and effective coverage width for partial edge strips.

Saving uses project format 10. Projects from versions 2–7 open with length matching off to preserve their estimates. New projects start with length matching on.

## Taylor Metal panel profiles and finishes

In **Panels & 3D**, open **Taylor Metal profiles & finishes** in Roof panels or Wall panels. Select the profile, coverage and finish, then choose **Apply & view in 3D**. **Inspect surface** centers the camera on the roof or wall you click. **Full model** restores the overall view. Project files retain both profile choices and preview colors. A catalog profile updates the effective coverage and applies the published standard length when one is confirmed. The existing length field remains editable for confirmed factory orders.

The library uses Taylor Metal's [product catalog](https://taylormetal.com/products/), [Contour Collection](https://taylormetal.com/wp-content/uploads/2025/06/ContourBrochure-06.23.25.pdf), and [color charts](https://taylormetal.com/colors-and-finishes/). The 3D mesh approximates the exposed shape at profile scale. Drawings linked from each entry cover lapping and exact bend details. Entries awaiting a verified section are available as references. Stretch-out requires a product-specific fabrication value. Display colors approximate the ArmorTech and standard Kynar charts. Product, gauge and branch determine actual availability.

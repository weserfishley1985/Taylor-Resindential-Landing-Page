import {FT, area, clipX, gableHouseTemplate, project, unproject} from './geometry.mjs';
import {parseProject, PROJECT_VERSION} from './project.mjs';

const sides = ['South', 'East', 'North', 'West'];
const openingKinds = ['Door', 'Garage door', 'Window'];

function dimension(value, min, max, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw Error(`Enter ${field} between ${min} and ${max}.`);
  }
  return value;
}

// The proposed footprint is a rectangle aligned to the review axes. Clip each
// existing roof/footprint against it so adjoining boundaries can still touch.
function overlapsFootprint(points, origin, anchor, halfWidth, halfDepth) {
  const local = points.map(p => {
    const q = project(p, origin);
    return {x:q.x - anchor.x, y:q.y - anchor.y};
  });
  const across = clipX(clipX(local, -halfWidth, true), halfWidth, false);
  const swapped = across.map(p => ({x:p.y, y:p.x}));
  const inside = clipX(clipX(swapped, -halfDepth, true), halfDepth, false);
  return area(inside) > 1e-6; // m², ignores floating-point noise along touching edges.
}

export function buildPlanProject(current, review, center, newId = () => crypto.randomUUID()) {
  const width = dimension(review.width, 4, 500, 'east–west width (ft)');
  const depth = dimension(review.depth, 4, 500, 'north–south depth (ft)');
  const height = dimension(review.wallHeight, 1, 200, 'wall height (ft)');
  const pitch = dimension(review.pitch, 0, 24, 'roof pitch per 12');
  const roofType = review.roof ?? 'gable';
  if (!['gable', 'shed', 'flat'].includes(roofType)) throw Error('Choose a supported roof shape.');
  if (roofType === 'gable' && !['EW', 'NS'].includes(review.ridge)) throw Error('Choose a ridge direction.');
  if (roofType === 'shed' && !sides.includes(review.downslope)) throw Error('Choose which side has the low eave.');
  if (roofType === 'flat' ? pitch !== 0 : pitch <= 0) throw Error('A flat roof needs zero pitch. A pitched roof needs a positive pitch.');
  if (!Array.isArray(review.openings) || review.openings.length > 200) throw Error('Review the list of openings (maximum 200).');
  const name = String(review.name || '').trim() || 'Imported building';
  if (name.length > 46 || /[\u0000-\u001f]/.test(name)) throw Error('Use a building name of up to 46 printable characters.');

  const anchorGeo = {
    lat: dimension(center?.lat, -85, 85, 'map latitude'),
    lng: dimension(center?.lng, -180, 180, 'map longitude')
  };
  const candidate = structuredClone(current);
  candidate.version = PROJECT_VERSION;
  const parts = candidate.building?.parts || [];
  // Legacy footprints derive wall IDs from their original index. Give the
  // converted part that same ID so all its existing openings keep their wall.
  if (candidate.building?.footprint) {
    parts.push({id:'building-0', name:'Main house', wallHeight:candidate.building.wallHeight, footprint:candidate.building.footprint});
  }
  if (parts.length >= 50 || candidate.faces.length + (roofType === 'gable' ? 2 : 1) > 100 ||
      (candidate.wallOpenings?.length || 0) + review.openings.length > 200) {
    throw Error('This import exceeds the project limit of 50 sections, 100 planes or 200 openings.');
  }
  const hasGeometry = parts.length || candidate.faces.length || candidate.outlines.length || candidate.walls?.length;
  if (!hasGeometry) candidate.origin = anchorGeo;
  const origin = candidate.origin;
  const anchor = project(anchorGeo, origin);
  const polygons = [...parts.map(p => p.footprint), ...candidate.faces.map(f => f.points)];
  if (polygons.some(p => overlapsFootprint(p, origin, anchor, width * FT / 2, depth * FT / 2))) {
    throw Error('The imported footprint overlaps an existing roof or building. Move the map center to the intended location and retry.');
  }

  const toGeo = p => unproject({x:anchor.x + p.x, y:anchor.y + p.y}, origin);
  // Keep the wall order SW → SE → NE → NW for every roof layout.
  const hw = width * FT / 2, hd = depth * FT / 2;
  const footprint = [{x:-hw,y:-hd}, {x:hw,y:-hd}, {x:hw,y:hd}, {x:-hw,y:hd}].map(toGeo);
  const partId = newId();
  const part = {id:partId, name, wallHeight:height, footprint};
  const faceStart = candidate.faces.length;
  parts.push(part);
  candidate.building = {kind:'multi-gable', parts};

  if (roofType === 'gable') {
    const northSouth = review.ridge === 'NS';
    const roof = gableHouseTemplate({
      widthFeet:northSouth ? depth : width, depthFeet:northSouth ? width : depth,
      eaveHeight:height, pitch, name
    });
    const roofGeo = p => toGeo(northSouth ? {x:-p.y, y:p.x} : p);
    const exposedSides = northSouth ? ['East', 'West'] : ['South', 'North'];
    for (const [i, face] of roof.faces.entries()) {
      candidate.faces.push({
        ...face, id:newId(), name:`${name} — ${exposedSides[i]} roof`,
        bearing:northSouth ? (face.bearing + 270) % 360 : face.bearing,
        points:face.points.map(roofGeo)
      });
    }
  } else {
    const bearings = {South:180, East:90, North:0, West:270};
    const lowEdge = sides.indexOf(review.downslope);
    const edges = sides.map((_, i) => {
      if (roofType === 'flat') return 'Unlabeled';
      if (i === lowEdge) return 'Eave';
      // The high boundary might connect to a step or adjacent building.
      // Leave its trim assignment for the user to verify.
      return (i + 2) % 4 === lowEdge ? 'Unlabeled' : 'Rake';
    });
    candidate.faces.push({
      id:newId(), name:`${name} — ${roofType} roof`, type:'Main roof',
      pitch, bearing:roofType === 'flat' ? 0 : bearings[review.downslope], eave:height,
      points:footprint.map(p => ({...p})), edges
    });
  }
  part.roofFaceIds = candidate.faces.slice(faceStart).map(face => face.id);
  candidate.wallOpenings ||= [];
  for (const [index, row] of review.openings.entries()) {
    const wallIndex = sides.indexOf(row?.side);
    if (wallIndex < 0 || !openingKinds.includes(row?.kind)) throw Error(`Choose a wall and type for opening ${index + 1}.`);
    const label = `for opening ${index + 1} (ft)`;
    candidate.wallOpenings.push({
      id:newId(), wallId:`${partId}:${wallIndex}`, kind:row.kind,
      offset:dimension(row.offset, 0, 500, 'distance from wall start ' + label),
      width:dimension(row.width, .01, 500, 'width ' + label),
      height:dimension(row.height, .01, 200, 'height ' + label),
      sill:dimension(row.sill, 0, 200, 'bottom above floor ' + label)
    });
  }
  if (review.fileName) {
    const added = candidate.wallOpenings.slice(candidate.wallOpenings.length - review.openings.length);
    part.planSource = {
      file:review.fileName,
      notes:(Array.isArray(review.notes) ? review.notes : []).slice(0,60),
      openings:review.openings.flatMap((row,i)=>row.source ? [{id:added[i].id,detail:row.source}] : [])
    };
  }
  // Run the same validation as Save → Open before the app creates an undo checkpoint.
  return parseProject(candidate);
}

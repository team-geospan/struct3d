/**
 * Copyright GEOSPAN Corp
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import earcut, { flatten } from "earcut";
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

function calcCollectionBounds(collection) {
  let [minx, miny, minz, maxx, maxy, maxz] = [
    null,
    null,
    null,
    null,
    null,
    null,
  ];

  collection.structures.forEach((st) => {
    Object.values(st.points).map((pt) => {
      const [x, y, z] = pt.coordinates;
      if (minx === null || x < minx) {
        minx = x;
      }
      if (maxx === null || x > maxx) {
        maxx = x;
      }
      if (miny === null || y < miny) {
        miny = y;
      }
      if (maxy === null || y > maxy) {
        maxy = y;
      }
      if (minz === null || z < minz) {
        minz = z;
      }
      if (maxz === null || z > maxz) {
        maxz = z;
      }
    });
  });

  // make this compatible with 2d representation
  return [minx, miny, maxx, maxy, minz, maxz];
}

function getAnchor(collection) {
  const bounds = calcCollectionBounds(collection);
  const x0 = bounds[0] + (bounds[2] - bounds[0]) / 2;
  const y0 = bounds[1] + (bounds[3] - bounds[1]) / 2;
  return [x0, y0, bounds[4]];
}

export function createLines(
  collection,
  baseElevation,
  edgeColors,
  width,
  height,
) {
  const [x0, y0, minz] = getAnchor(collection);
  const lines = collection.structures.flatMap((structure, stIdx) => {
    const { edges, points } = structure;
    return Object.keys(edges).map((edgeId) => {
      const edge = edges[edgeId];
      // offset and swap coordinates
      const linePoints = edge.points.map((pointId) => {
        const pt = points[pointId].coordinates;
        return [pt[0] - x0, pt[2] - minz + baseElevation, y0 - pt[1]];
      });

      const geometry = new LineGeometry();
      geometry.setPositions(linePoints.flatMap((p) => p));

      const material = new LineMaterial({
        color: edgeColors[edge.kind] || "#000000",
        linewidth: edge.kind ? 3 : 1,
      });
      material.resolution.set(width, height);

      const line = new Line2(geometry, material);
      line.userData = {
        ...edge.properties,
        kind: edge.kind,
        id: `${stIdx}-${edgeId}`,
        layer: "edges",
      };
      return line;
    });
  });

  return lines;
}

/**
 * Convert the edge into a list of point IDs,
 * edges are not directional! The ends need to be checked for
 * continuity
 */
function simplifyRing(edges) {
  if (!edges || edges.length === 0) {
    return [];
  }

  const sortedList = [edges.shift()];

  while (edges.length > 0) {
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      if (sortedList[sortedList.length - 1][1] === edge[0]) {
        sortedList.push(edges.splice(i, 1)[0]);
        break;
      } else if (sortedList[sortedList.length - 1][1] === edge[1]) {
        sortedList.push(edges.splice(i, 1)[0].reverse());
        break;
      }
    }
  }

  const asPoints = sortedList.map((e) => e[0]);
  asPoints.push(sortedList[0][0]);
  return asPoints;
}

export function createFacets(structureCollection, baseElevation, facetColors) {
  const [x0, y0, minz] = getAnchor(structureCollection);

  const meshes = structureCollection.structures.flatMap((structure, stIdx) => {
    const { edges, points } = structure;

    return Object.keys(structure.surfaces).map((surfaceId) => {
      const surface = structure.surfaces[surfaceId];

      const coords = surface.edges.map((ring) => {
        return simplifyRing(
          structuredClone(ring.map((edgeId) => edges[edgeId].points)),
        )
          .map((ptId) => points[ptId].coordinates)
          .map((pt) => [pt[0] - x0, y0 - pt[1], pt[2] - minz + baseElevation]);
      });

      // make all the triangles, thank you earcut!
      const data = flatten(coords);
      const triangles = earcut(data.vertices, data.holes, data.dimensions);

      // swap the y and z coordinates
      for (let i = 0, len = data.vertices.length; i < len; i += 3) {
        const y = data.vertices[i + 1];
        const z = data.vertices[i + 2];
        data.vertices[i + 1] = z;
        data.vertices[i + 2] = y;
      }

      const bufferGeometry = new THREE.BufferGeometry();
      bufferGeometry.setIndex(triangles);
      bufferGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(data.vertices), 3),
      );
      // Normally, the normals would be used to calculate the normal
      //  for each vertex and apply the material, *however* we use flatShading
      //  so do not want to compute the normals
      // bufferGeometry.computeVertexNormals();

      const material = new THREE.MeshPhongMaterial({
        side: THREE.DoubleSide,
        color: facetColors[surface.properties?.material || "asphalt"],
        flatShading: true,
        shininess: 30,
      });

      const polygon = new THREE.Mesh(bufferGeometry, material);
      polygon.userData = {
        ...surface.properties,
        id: `${stIdx}-${surfaceId}`,
        layer: "facets",
      };
      return polygon;
    });
  });
  return meshes;
}

export function createReferences(scene) {
  const floorGeom = new THREE.PlaneGeometry(1000, 1000);
  const floorMaterial = new THREE.MeshPhongMaterial({
    color: 0x315d0a,
    side: THREE.DoubleSide,
  });
  const floorMesh = new THREE.Mesh(floorGeom, floorMaterial);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  // TODO: Size is set to "1" which is one meter in this projection,
  //       we should do something for US measurements
  const gridHelper = new THREE.GridHelper(100, 100, 0x888888, 0x888888);
  gridHelper.receiveShadow = true;
  gridHelper.position.set(0, 0.1, 0);
  scene.add(gridHelper);
}

export function addLights(scene, center, bounds) {
  const intensity = 5000;
  const ambient = new THREE.AmbientLight(0xffffff);
  ambient.intensity = 1.5;
  scene.add(ambient);

  const spotLight = new THREE.SpotLight(0xffffff, intensity);
  spotLight.position.set(bounds.x / 2, bounds.y + 50, bounds.z / 2);
  spotLight.castShadow = true;
  spotLight.angle = 5.0;
  spotLight.lookAt(center);

  scene.add(spotLight);
}

export function clearScene(scene) {
  scene.clear();
}

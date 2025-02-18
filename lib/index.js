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

import { createElement, useCallback, useEffect, useMemo, useRef } from "react";
import { useResizeDetector } from "react-resize-detector";
import { DEFAULT_EDGE_COLORS, DEFAULT_FACET_COLORS } from "./defaults";
import { toMercator } from "@turf/projection";
import PropTypes from "prop-types";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls";

import {
  addLights,
  clearScene,
  createFacets,
  createLines,
  createReferences,
} from "./draw";

const THREED_SKY_COLOR = "#CDEBF7";

const setupScene = (
  divRef,
  sceneRef,
  cameraRef,
  rendererRef,
  orbitRef,
  fieldOfView,
) => {
  const [width, height] = [
    divRef.current.offsetWidth,
    divRef.current.offsetHeight,
  ];

  // create the scene
  const scene = new THREE.Scene();
  sceneRef.current = scene;

  scene.background = new THREE.Color(THREED_SKY_COLOR);
  scene.fog = new THREE.Fog(scene.background, 1, 5000);

  const camera = new THREE.PerspectiveCamera(
    fieldOfView,
    width / height,
    0.1,
    1000.0,
  );
  cameraRef.current = camera;
  const renderer = new THREE.WebGLRenderer({
    preserveDrawingBuffer: true,
    antialias: true,
  });

  const orbitControl = new OrbitControls(camera, renderer.domElement);
  orbitControl.minPolarAngle = 0;
  orbitControl.maxPolarAngle = Math.PI * 0.5;
  orbitRef.current = orbitControl;

  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  rendererRef.current = renderer;
  renderer.setAnimationLoop(() => {
    renderer.render(scene, camera);
  });
  divRef.current.appendChild(renderer.domElement);
};

const renderModel = (
  divRef,
  collection,
  baseElevation,
  facetColors,
  edgeColors,
  sceneRef,
  cameraRef,
  orbitRef,
  fieldOfView,
) => {
  // calculate the spatial extents of the meshes
  const boundingBox = new THREE.Box3();
  const [width, height] = [
    divRef.current.offsetWidth,
    divRef.current.offsetHeight,
  ];
  const scene = sceneRef.current;
  const camera = cameraRef.current;
  const orbitControl = orbitRef.current;

  // convert the polygons to meshes
  const meshes = createFacets(collection, baseElevation, facetColors);

  meshes.forEach((mesh) => {
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
    boundingBox.expandByObject(mesh);
  });

  const lines = createLines(
    collection,
    baseElevation + 0.01,
    edgeColors,
    width,
    height,
  );
  lines.forEach((line) => {
    scene.add(line);
  });

  const center = new THREE.Vector3();
  boundingBox.getCenter(center);

  const bounds = new THREE.Vector3();
  boundingBox.getSize(bounds);

  createReferences(scene, center, bounds);

  addLights(scene, center, bounds);

  orbitControl.target = center;

  // calculate the distance to zoom out in order to fit the entire model
  const h = bounds.x / 2 / Math.tan(((fieldOfView / 2.0) * Math.PI) / 180);
  const d = bounds.z / 2 / Math.tan(((fieldOfView / 2.0) * Math.PI) / 180);

  camera.position.x = center.x / 1.25;
  camera.position.y = Math.max(h, d) + bounds.y;
  camera.position.z = bounds.z / 1.25;
  camera.lookAt(center);
};

export default function StructureThreeD({
  structureCollection,
  selectedIds,
  onClick,
  selectionColor = "#d4af38",
  facetColors = DEFAULT_FACET_COLORS,
  edgeColors = DEFAULT_EDGE_COLORS,
}) {
  const baseElevation = 10;
  const fieldOfView = 70;
  const divRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const orbitRef = useRef(null);
  const rendererRef = useRef(null);

  const collection = useMemo(() => {
    // check the projection of the structures and put them into webmerc
    const cleanCollection = structuredClone(structureCollection);
    cleanCollection.structures.forEach((structure) => {
      if (structure.projection === "crs84") {
        // convert the points to mercator
        Object.keys(structure.points).forEach((pointId) => {
          // this looks messier than it is, get the coordinates from the point,
          //  shim toMercator to use a GeoJSON style point, then pull the coordinates
          //  out in order to reproject the stucture.
          const coordinates = structure.points[pointId].coordinates;
          structure.points[pointId].coordinates = toMercator({
            type: "Point",
            coordinates,
          }).coordinates;
        });
        structure.projection = "webmerc";
      } else if (structure.projection === "webmerc") {
        return structure;
      } else {
        // yikes this is unsupported right now!
        console.error(
          `Structure with projection "${structure.projection}" is not currently supported.`,
        );
      }
    });

    return cleanCollection;
  }, [structureCollection]);

  // handle resizing of the div!
  const { width, height, ref } = useResizeDetector();

  useEffect(() => {
    if (divRef.current) {
      if (sceneRef.current === null) {
        setupScene(
          divRef,
          sceneRef,
          cameraRef,
          rendererRef,
          orbitRef,
          fieldOfView,
        );
      }

      clearScene(sceneRef.current);
      renderModel(
        divRef,
        collection,
        baseElevation,
        facetColors,
        edgeColors,
        sceneRef,
        cameraRef,
        orbitRef,
        fieldOfView,
      );
    }
  }, [collection, selectionColor]);

  const handleClick = useCallback(
    (evt) => {
      const [x, y] = [evt.nativeEvent.offsetX, evt.nativeEvent.offsetY];
      const [width, height] = [
        divRef.current.offsetWidth,
        divRef.current.offsetHeight,
      ];
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();
      mouse.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(
        sceneRef.current.children,
        true,
      );
      const ids = intersects
        .map((f) => f.object.userData)
        .map((f) => f.id)
        // ensure the object has an ID
        .filter((id) => !!id);
      if (onClick) {
        onClick(ids);
      }
    },
    [onClick],
  );

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.traverse((object) => {
        // ensure the object has a material set and the userData has our layer specified
        if (object.material && Boolean(object.userData?.layer)) {
          let color =
            object.userData.layer === "facets"
              ? facetColors[object.userData?.material || "asphalt"]
              : edgeColors[object.userData.kind] || "#00000000";
          if (selectedIds.includes(object.userData?.id)) {
            color = selectionColor;
          }
          object.material.color.set(color);
        }
      });
    }
  }, [selectedIds, selectionColor]);

  useEffect(() => {
    if (rendererRef.current && cameraRef.current && !!width && !!height) {
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    }
  }, [width, height]);

  return createElement(
    "div",
    {
      ref,
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "#eee",
      },
    },
    createElement("div", {
      ref: divRef,
      onClick: handleClick,
      className: "struct-3d",
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
      },
    }),
  );
}

StructureThreeD.propTypes = {
  structureCollection: PropTypes.object,
  selectedIds: PropTypes.array,
  onClick: PropTypes.func,
  selectionColor: PropTypes.string,
  facetColors: PropTypes.object,
  edgeColors: PropTypes.object,
};

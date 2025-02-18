import React, { useRef, useState, useEffect } from "react";
import PropTypes from "prop-types";
import StructureThreeD from "../../../lib/index.js";

// This is a nice default with two structures
const DEMO_URL =
  "https://raw.githubusercontent.com/team-geospan/structures-json/refs/heads/main/versions/examples/V1.0-draft/two-structure-collection.json";

// Demo changing the edge colors using different palettes
const PALETTES = {
  hicontrast: {
    eave: "#000000", // Black
    hip: "#FFFFFF", // White
    valley: "#FFD700", // Bright Yellow
    flash: "#FF0000", // Bright Red
    ridge: "#00FFFF", // Cyan
    rake: "#FF00FF", // Magenta
    stepflash: "#00FF00", // Neon Green
    parapet: "#0000FF", // Pure Blue
    fance: "#FFA500", // Orange
    chimney: "#808080", // Gray for balance
  },
  hotdog: {
    eave: "#FF0000", // Bright Red
    hip: "#FFFF00", // Bright Yellow
    valley: "#00FFFF", // Cyan
    flash: "#FF00FF", // Magenta
    ridge: "#0000FF", // Blue
    rake: "#FFA500", // Orange
    stepflash: "#00FF00", // Bright Green
    parapet: "#FF4500", // Red-Orange
    fance: "#FFD700", // Gold
    chimney: "#800000", // Dark Red
  },
};

// Somewhat bad practice to put all the components into one file but this
//  puts everything into a singular grokable view.
function SelectedInfo({ structureCollection, selectedId }) {
  const [structureIndex, elementId] = selectedId.split("-");
  const structure = structureCollection.structures[parseInt(structureIndex)];

  let unitLabel = "sq. m.";
  let value = 0.0;
  if (structure.edges[elementId]) {
    // use as edge
    unitLabel = "m.";
    value = structure.edges[elementId].properties.length;
  } else {
    // assume a surface
    value = structure.surfaces[elementId].properties.area;
  }

  return (
    <div>
      {elementId}: {value} {unitLabel}
    </div>
  );
}

SelectedInfo.propTypes = {
  structureCollection: PropTypes.object,
  selectedId: PropTypes.string,
};

function Demo() {
  const [isLoading, setLoading] = useState(true);
  const [structureCollection, setStructureCollection] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [url, setUrl] = useState(DEMO_URL);
  const [palette, setPalette] = useState("");
  const inputRef = useRef();

  useEffect(() => {
    fetch(url)
      .then((r) => r.json())
      .then((stc) => {
        if (stc.kind === "structurecollection") {
          setStructureCollection(stc);
        } else if (stc.kind === "structure") {
          setStructureCollection({
            kind: "structurecollection",
            structures: [stc],
          });
        }
        setLoading(false);
      });
  }, [url]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
      }}
    >
      <div
        style={{
          padding: "6px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 1,
          }}
        >
          <input ref={inputRef} defaultValue={url} style={{ flex: 1 }} />
          <button
            onClick={() => {
              setUrl(inputRef.current.value);
            }}
          >
            Load
          </button>
        </div>
        <div>
          <label>Color palette:</label>
          <select
            value={palette}
            onChange={(evt) => {
              setPalette(evt.target.value);
            }}
          >
            <option value="">Default</option>
            <option value="hicontrast">High Contrast</option>
            <option value="hotdog">Hot Dog Stand</option>
          </select>
        </div>
      </div>
      <div
        style={{
          position: "relative",
          flex: 1,
        }}
      >
        {selectedIds && selectedIds.length > 0 && (
          <div
            style={{
              position: "absolute",
              zIndex: 10,
              left: 12,
              top: 12,
              padding: 12,
              borderRadius: 6,
              border: "solid 2px #d4af38",
              backgroundColor: "#333",
              color: "white",
            }}
          >
            {selectedIds.map((selectedId) => (
              <SelectedInfo
                key={selectedId}
                selectedId={selectedId}
                structureCollection={structureCollection}
              />
            ))}
          </div>
        )}
        {isLoading && (
          <div
            style={{
              display: "flex",
              position: "absolute",
              left: 0,
              top: 0,
              width: "100%",
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Loading...
          </div>
        )}
        {!isLoading && structureCollection && (
          <StructureThreeD
            key={url + palette}
            structureCollection={structureCollection}
            onClick={(ids) => {
              setSelectedIds(ids);
            }}
            selectedIds={selectedIds}
            edgeColors={PALETTES[palette]}
          />
        )}
      </div>
    </div>
  );
}

Demo.propTypes = {
  url: PropTypes.string,
};

export default Demo;

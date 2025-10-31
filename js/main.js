mapboxgl.accessToken = 'pk.eyJ1IjoidGFuYXZpNzciLCJhIjoiY21oY25oNWlmMHRwajJqb2RycDZqbXBwNCJ9.VtwiD8Ee5wHAX3M0nrHQ7A';

console.log('js/main.js loaded, mapbox token present?', !!mapboxgl.accessToken);

let map = new mapboxgl.Map({
  container: 'map', 
  style: 'mapbox://styles/mapbox/satellite-v9', 
  zoom: 13, 
  center: [-122.3137, 47.6561] 
});

async function geojsonFetch() {
  try {
    // fetch pharmacies first
    const response = await fetch('assets/pharmacies.geojson');
    if (!response.ok) throw new Error('Failed to load pharmacies.geojson: ' + response.status);
    const pharmacies = await response.json();
    console.log('pharmacies loaded:', pharmacies && pharmacies.features ? pharmacies.features.length : pharmacies);

    // Populate table (runs now that pharmacies is available)
    const table = document.getElementsByTagName("table")[0];
    if (!table) {
      console.error('Table element not found in DOM. Make sure you have a <table> in your HTML.');
    } else {
      for (let i = 0; i < (pharmacies.features || []).length; i++) {
        const feat = pharmacies.features[i];
        const row = table.insertRow(-1);
        const cell1 = row.insertCell(0);
        const cell2 = row.insertCell(1);
        const cell3 = row.insertCell(2);
        const cell4 = row.insertCell(3);

        cell1.innerHTML = feat.properties.id || '';
        cell2.innerHTML = feat.properties.name || '';
        cell3.innerHTML = feat.properties.address || '';
        cell4.innerHTML = feat.properties.rating != null ? feat.properties.rating : '';

        row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
          const [lng, lat] = feat.geometry.coordinates;
          map.flyTo({ center: [lng, lat], zoom: 15 });
          new mapboxgl.Popup()
            .setLngLat([lng, lat])
            .setHTML(`<strong>${escapeHtml(feat.properties.name || '')}</strong><div>${escapeHtml(feat.properties.address || '')}</div><div>Rating: ${feat.properties.rating}</div>`)
            .addTo(map);
        });
      }
    }

    map.on('load', function loadingData() {
      // add pharmacies source & layer
      if (!map.getSource('pharmacies')) {
        map.addSource('pharmacies', { type: 'geojson', data: pharmacies });
      } else {
        map.getSource('pharmacies').setData(pharmacies);
      }

      if (!map.getLayer('pharmacies-layer')) {
        map.addLayer({
          id: 'pharmacies-layer',
          type: 'circle',
          source: 'pharmacies',
          paint: {
            'circle-radius': 8,
            'circle-stroke-width': 2,
            'circle-color': '#2b8cbe',
            'circle-stroke-color': 'white'
          }
        });
      }

      if (pharmacies.features && pharmacies.features.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        pharmacies.features.forEach(f => bounds.extend(f.geometry.coordinates));
        if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40, maxZoom: 15 });
      }

      // fetch and add areas (polygons) AFTER style is loaded
      fetch('assets/SeattleAreas.geojson')
        .then(r => {
          console.log('areas fetch status:', r.status, r.statusText);
          if (!r.ok) throw new Error('Failed to load areas GeoJSON: ' + r.status);
          return r.json();
        })
        .then(areasGeo => {
          console.log('areasGeo features:', (areasGeo.features || []).length);

          if (!map.getSource('areas')) {
            map.addSource('areas', { type: 'geojson', data: areasGeo });
          } else {
            map.getSource('areas').setData(areasGeo);
          }

          if (!map.getLayer('areas-fill')) {
            map.addLayer({
              id: 'areas-fill',
              type: 'fill',
              source: 'areas',
              paint: {
                'fill-color': '#f1c40f',
                'fill-opacity': 0.12
              }
            }, 'pharmacies-layer');
            console.log('areas-fill layer added');
          }

          if (!map.getLayer('areas-outline')) {
            map.addLayer({
              id: 'areas-outline',
              type: 'line',
              source: 'areas',
              paint: {
                'line-color': '#f39c12',
                'line-width': 2
              }
            });
            console.log('areas-outline layer added');
          }

          // add labels
          if (!map.getLayer('areas-label')) {
            map.addLayer({
              id: 'areas-label',
              type: 'symbol',
              source: 'areas',
              layout: {
                'text-field': ['coalesce', ['get', 'name'], ['get', 'id']],
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                'text-size': 12
              },
              paint: { 'text-color': '#222' }
            });
            console.log('areas-label layer added');
          }

          map.on('click', 'areas-fill', (e) => {
            const feat = e.features && e.features[0];
            const name = feat && feat.properties && (feat.properties.name || feat.properties.id) || 'Area';
            new mapboxgl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(`<strong>${escapeHtml(name)}</strong>`)
              .addTo(map);
          });
          map.on('mouseenter', 'areas-fill', () => map.getCanvas().style.cursor = 'pointer');
          map.on('mouseleave', 'areas-fill', () => map.getCanvas().style.cursor = '');
        })
        .catch(err => console.error('areas load error:', err));
    });

  } catch (err) {
    console.error('Error in geojsonFetch:', err);
  }
}

geojsonFetch();

function escapeHtml(str) {
  return String(str).replace(/[&<>"'`=\/]/g, function (s) {
    return ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;'
    })[s];
  });
}

// Button selection, event listener, and sorting function (sorts by rating descending)
let btn = document.getElementById("sortBtn") || document.getElementsByTagName("button")[0];
if (btn) btn.addEventListener('click', sortTable);

// define the function to sort table by rating (highest to lowest)
function sortTable(e) {
  let table, rows, switching, i, x, y, shouldSwitch;
  table = document.getElementsByTagName("table")[0];
  if (!table) return;
  switching = true;
  while (switching) {
    switching = false;
    rows = table.rows;
    for (i = 1; i < (rows.length - 1); i++) {
      shouldSwitch = false;
      x = parseFloat(rows[i].getElementsByTagName("td")[3].innerHTML) || 0;
      y = parseFloat(rows[i + 1].getElementsByTagName("td")[3].innerHTML) || 0;
      if (x < y) {
        shouldSwitch = true;
        break;
      }
    }
    if (shouldSwitch) {
      rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
      switching = true;
    }
  }
}
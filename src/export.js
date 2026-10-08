/* Workbench — shared parts for browser-based maker tools.
 * Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* export.js — 3MF (multi-colour) and STL (single body) writers.
 *
 * The 3MF follows how Bambu Studio writes a multi-colour file: one mesh object
 * per colour, gathered by an assembly object's <components>, one assembly and
 * build item per printable object. Colour is declared three ways, because
 * slicers disagree about where to look:
 *
 *   Metadata/model_settings.config    Bambu, Orca, Creality — <part id> is the
 *                                     component's objectid, plus an extruder
 *   Metadata/Slic3r_PE_model.config   PrusaSlicer, SuperSlicer — the same parts
 *                                     addressed as triangle ranges, per object
 *   Metadata/project_settings.config  filament swatches for both
 *   <basematerials>                   ignored by slicers; used by viewers
 *
 * A real Bambu file carries no basematerials at all, which is why a file relying
 * on them imports as a single colour.
 */
window.WB = window.WB || {};
(function (WB) {
  'use strict';

  var CORE = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02';
  var MAT  = 'http://schemas.microsoft.com/3dmanufacturing/material/2015/02';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c];
    });
  }

  var num = function (v) {
    var s = v.toFixed(4);
    // trim trailing zeros — meaningfully smaller files on big meshes
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s === '-0' ? '0' : s;
  };

  /* Merge duplicate vertices so shared edges reference one index. */
  function dedupe(part) {
    var p = part.positions, ix = part.indices;
    var map = new Map(), verts = [], remap = new Int32Array(p.length / 3);
    for (var i = 0; i < p.length / 3; i++) {
      var x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      var key = num(x) + '|' + num(y) + '|' + num(z);
      var at = map.get(key);
      if (at === undefined) { at = verts.length / 3; map.set(key, at); verts.push(x, y, z); }
      remap[i] = at;
    }
    var tris = [];
    for (var t = 0; t < ix.length; t += 3) {
      var a = remap[ix[t]], b = remap[ix[t + 1]], c = remap[ix[t + 2]];
      if (a === b || b === c || a === c) continue;   // collapsed by the merge
      tris.push(a, b, c);
    }
    return { verts: verts, tris: tris };
  }

  function bounds(parts) {
    var b = { minX: Infinity, minY: Infinity, minZ: Infinity };
    parts.forEach(function (part) {
      var p = part.positions;
      for (var i = 0; i < p.length; i += 3) {
        if (p[i] < b.minX) b.minX = p[i];
        if (p[i + 1] < b.minY) b.minY = p[i + 1];
        if (p[i + 2] < b.minZ) b.minZ = p[i + 2];
      }
    });
    if (!isFinite(b.minX)) { b.minX = b.minY = b.minZ = 0; }
    return b;
  }

  /* opts: {
       app:     'My Tool'                       written as the Application
       title:   'design name'
       objects: [{ name, parts: [part, …] }]    one printable object each
     }
     A part is { positions, indices, color: '#rrggbb', colorIndex, label },
     already placed where it should print. Objects keep their x/y layout and
     each rests on the bed. */
  WB.export3MF = function (opts) {
    var objects = opts.objects.map(function (o) {
      return { name: o.name, parts: o.parts.filter(function (p) { return p.indices.length; }) };
    }).filter(function (o) { return o.parts.length; });
    var parts = [].concat.apply([], objects.map(function (o) { return o.parts; }));
    if (!parts.length) return Promise.reject(new Error('Nothing to export.'));

    /* One base material per distinct colour actually used. Slicers ignore these,
       but generic viewers and thumbnails use them. */
    var slots = [], slotOf = {};
    parts.forEach(function (p) {
      if (slotOf[p.colorIndex] === undefined) {
        slotOf[p.colorIndex] = slots.length;
        slots.push({ index: p.colorIndex, color: p.color });
      }
    });

    var MATGROUP = 1;
    var name = opts.title || 'model';

    /* Layout copied from how Bambu Studio actually writes a multi-colour file:
       one mesh object per colour, gathered by an assembly object's components.
       model_settings.config then keys each <part> by the *component's objectid*
       and gives it an extruder — that id link is what makes the colours stick. */
    var id = MATGROUP + 1;
    objects.forEach(function (o) {
      var triAt = 0;   // PrusaSlicer counts triangles per object
      o.meshes = o.parts.map(function (part) {
        var m = dedupe(part);
        var ms = {
          id: id++, label: part.label, verts: m.verts, tris: m.tris,
          slot: slotOf[part.colorIndex],
          // Numbered densely from 1 in order of use: a slicer with two filaments
          // loaded cannot map an "extruder 4" emitted from palette slot 4.
          extruder: slotOf[part.colorIndex] + 1,
          first: triAt, last: triAt + m.tris.length / 3 - 1
        };
        triAt += m.tris.length / 3;
        return ms;
      });
    });
    objects.forEach(function (o) { o.assembly = id++; o.bounds = bounds(o.parts); });

    var all = bounds(parts);

    var xml = [];
    xml.push('<?xml version="1.0" encoding="UTF-8"?>');
    xml.push('<model unit="millimeter" xml:lang="en-US" xmlns="' + CORE + '" xmlns:m="' + MAT + '">');
    xml.push('<metadata name="Application">' + esc(opts.app || 'Workbench') + '</metadata>');
    xml.push('<metadata name="Title">' + esc(name) + '</metadata>');
    xml.push('<metadata name="CreationDate">' + new Date().toISOString().slice(0, 10) + '</metadata>');
    xml.push('<resources>');

    xml.push('<basematerials id="' + MATGROUP + '">');
    slots.forEach(function (sl, i) {
      xml.push('<base name="Colour ' + (i + 1) + '" displaycolor="' +
               esc(String(sl.color).toUpperCase()) + 'FF"/>');
    });
    xml.push('</basematerials>');

    objects.forEach(function (o) {
      o.meshes.forEach(function (ms) {
        xml.push('<object id="' + ms.id + '" type="model" name="' + esc(ms.label) +
                 '" pid="' + MATGROUP + '" pindex="' + ms.slot + '">');
        xml.push('<mesh><vertices>');
        for (var v = 0; v < ms.verts.length; v += 3) {
          xml.push('<vertex x="' + num(ms.verts[v]) + '" y="' + num(ms.verts[v + 1]) +
                   '" z="' + num(ms.verts[v + 2]) + '"/>');
        }
        xml.push('</vertices><triangles>');
        for (var t = 0; t < ms.tris.length; t += 3) {
          xml.push('<triangle v1="' + ms.tris[t] + '" v2="' + ms.tris[t + 1] +
                   '" v3="' + ms.tris[t + 2] + '"/>');
        }
        xml.push('</triangles></mesh></object>');
      });
    });

    objects.forEach(function (o) {
      xml.push('<object id="' + o.assembly + '" type="model" name="' + esc(o.name) + '">');
      xml.push('<components>');
      o.meshes.forEach(function (ms) {
        xml.push('<component objectid="' + ms.id + '" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>');
      });
      xml.push('</components></object>');
    });
    xml.push('</resources>');

    /* Shared x/y offset keeps the objects side by side as laid out; z is per
       object so each one rests on the bed. */
    xml.push('<build>');
    objects.forEach(function (o) {
      xml.push('<item objectid="' + o.assembly + '" transform="1 0 0 0 1 0 0 0 1 ' +
               num(-all.minX) + ' ' + num(-all.minY) + ' ' + num(-o.bounds.minZ) + '" printable="1"/>');
    });
    xml.push('</build>');
    xml.push('</model>');

    /* Bambu Studio / OrcaSlicer / Creality Print. <part id> must be the
       component's objectid — not a triangle range, which is what a real Bambu
       file makes clear. */
    var IDENTITY = '1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1';
    var ms2 = ['<?xml version="1.0" encoding="UTF-8"?>', '<config>'];
    objects.forEach(function (o) {
      ms2.push('  <object id="' + o.assembly + '">');
      ms2.push('    <metadata key="name" value="' + esc(o.name) + '"/>');
      ms2.push('    <metadata key="extruder" value="' + o.meshes[0].extruder + '"/>');
      o.meshes.forEach(function (m2) {
        ms2.push('    <part id="' + m2.id + '" subtype="normal_part">');
        ms2.push('      <metadata key="name" value="' + esc(m2.label) + '"/>');
        ms2.push('      <metadata key="extruder" value="' + m2.extruder + '"/>');
        ms2.push('      <metadata key="matrix" value="' + IDENTITY + '"/>');
        ms2.push('      <mesh_stat face_count="' + (m2.tris.length / 3) + '" edges_fixed="0" ' +
                 'degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>');
        ms2.push('    </part>');
      });
      ms2.push('  </object>');
    });
    ms2.push('</config>');

    /* PrusaSlicer / SuperSlicer merge the components into volumes in order, so
       its config addresses them as triangle ranges over that concatenation. */
    var pe = ['<?xml version="1.0" encoding="UTF-8"?>', '<config>'];
    objects.forEach(function (o) {
      pe.push(' <object id="' + o.assembly + '">');
      pe.push('  <metadata type="object" key="name" value="' + esc(o.name) + '"/>');
      o.meshes.forEach(function (m3) {
        pe.push('  <volume firstid="' + m3.first + '" lastid="' + m3.last + '">');
        pe.push('   <metadata type="volume" key="name" value="' + esc(m3.label) + '"/>');
        pe.push('   <metadata type="volume" key="volume_type" value="ModelPart"/>');
        pe.push('   <metadata type="volume" key="extruder" value="' + m3.extruder + '"/>');
        pe.push('  </volume>');
      });
      pe.push(' </object>');
    });
    pe.push('</config>');

    /* Filament swatches, in the same order as the extruder numbering. */
    var pal = slots.map(function (sl) { return sl.color.toUpperCase(); });
    var proj = JSON.stringify({ filament_colour: pal,
                                filament_type: pal.map(function () { return 'PLA'; }) });

    var contentTypes =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>' +
      '<Default Extension="config" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      '</Types>';

    var rels =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rel0" Target="/3D/3dmodel.model" ' +
      'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>' +
      '</Relationships>';

    var enc = new TextEncoder();
    return WB.zip([
      { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
      { name: '_rels/.rels',         data: enc.encode(rels) },
      { name: '3D/3dmodel.model',    data: enc.encode(xml.join('\n')) },
      { name: 'Metadata/model_settings.config',   data: enc.encode(ms2.join('\n')) },
      { name: 'Metadata/Slic3r_PE_model.config',  data: enc.encode(pe.join('\n')) },
      { name: 'Metadata/project_settings.config', data: enc.encode(proj) }
    ]);
  };

  /* Binary STL — every part merged, colour information dropped, moved so the
     whole thing sits on the bed at the origin. */
  WB.exportSTL = function (parts, header) {
    var total = 0;
    parts.forEach(function (p) { total += p.indices.length / 3; });
    if (!total) return null;

    var buf = new ArrayBuffer(84 + total * 50);
    var dv = new DataView(buf);
    header = String(header || 'Workbench').slice(0, 80);
    for (var h = 0; h < header.length; h++) dv.setUint8(h, header.charCodeAt(h));
    dv.setUint32(80, total, true);

    var b = bounds(parts);
    var off = 84;
    parts.forEach(function (part) {
      var p = part.positions, ix = part.indices;
      for (var i = 0; i < ix.length; i += 3) {
        var a = ix[i] * 3, bb = ix[i + 1] * 3, c = ix[i + 2] * 3;
        var ux = p[bb] - p[a], uy = p[bb + 1] - p[a + 1], uz = p[bb + 2] - p[a + 2];
        var vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
        var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        var len = Math.hypot(nx, ny, nz) || 1;

        dv.setFloat32(off, nx / len, true);
        dv.setFloat32(off + 4, ny / len, true);
        dv.setFloat32(off + 8, nz / len, true);
        var o = off + 12;
        [a, bb, c].forEach(function (v) {
          dv.setFloat32(o, p[v] - b.minX, true);
          dv.setFloat32(o + 4, p[v + 1] - b.minY, true);
          dv.setFloat32(o + 8, p[v + 2] - b.minZ, true);
          o += 12;
        });
        dv.setUint16(off + 48, 0, true);
        off += 50;
      }
    });

    return new Blob([buf], { type: 'model/stl' });
  };

  /* Save a Blob as a file in the browser's downloads. */
  WB.download = function (blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  };

})(window.WB);

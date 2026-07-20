// Core states and methods for the Proveedores module

window.ProveedoresModule = {
  modalHistorial: null,
  modalFacturas: null,

  initModals() {
    this.modalHistorial = new bootstrap.Modal(document.getElementById('modalHistorialCostos'));
    this.modalFacturas = new bootstrap.Modal(document.getElementById('modalFacturasProveedor'));
  }
};

window.abrirHistorial = async function(id, nombre) {
  document.getElementById('historialProveedorNombre').innerText = nombre;
  await window.cargarHistorial(id);
  window.ProveedoresModule.modalHistorial.show();
};

window.cargarHistorial = async function(proveedorId) {
  const tbody = document.getElementById('listaHistorialCuerpo');
  const msgVacio = document.getElementById('sinHistorialMsg');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div> Cargando historial...</td></tr>';

  try {
    const res = await fetch(`/proveedores/${proveedorId}/historial-costos`);
    const data = await res.json();

    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      msgVacio?.classList.remove('d-none');
      return;
    }

    msgVacio?.classList.add('d-none');
    data.forEach(h => {
      const fecha = new Date(h.fecha).toLocaleDateString();
      const monto = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(h.costo_unitario);
      const subtotal = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(h.subtotal);

      const tr = `
        <tr>
          <td class="small">${fecha}</td>
          <td class="fw-medium">${h.insumo}</td>
          <td class="text-end">${Number.parseFloat(h.cantidad).toFixed(2)}</td>
          <td class="text-end fw-bold">${monto}</td>
          <td class="text-end text-muted">${subtotal}</td>
        </tr>
      `;
      tbody.insertAdjacentHTML('beforeend', tr);
    });
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error al cargar historial</td></tr>';
  }
};

window.resetForm = function() {
  document.getElementById('modalTitle').innerText = 'Nuevo Proveedor';
  document.getElementById('p_id').value = '';
  document.getElementById('proveedorForm').reset();
  document.getElementById('p_activo').value = '1';
};

window.editProveedor = async function(id) {
  try {
    const res = await fetch(`/proveedores/${id}`);
    const p = await res.json();

    document.getElementById('modalTitle').innerText = 'Editar Proveedor';
    document.getElementById('p_id').value = p.id;
    document.getElementById('p_nombre').value = p.nombre;
    document.getElementById('p_nit').value = p.nit || '';
    document.getElementById('p_contacto').value = p.contacto || '';
    document.getElementById('p_telefono').value = p.telefono || '';
    document.getElementById('p_email').value = p.email || '';
    document.getElementById('p_direccion').value = p.direccion || '';
    document.getElementById('p_activo').value = p.activo ? '1' : '0';

    const modal = new bootstrap.Modal(document.getElementById('proveedorModal'));
    modal.show();
  } catch (error) {
    Swal.fire('Error', 'No se pudo cargar el proveedor', 'error');
  }
};

window.deleteProveedor = async function(id) {
  const result = await Swal.fire({
    title: '¿Estás seguro?',
    text: "Esta acción no se puede deshacer.",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  });

  if (result.isConfirmed) {
    try {
      const res = await fetch(`/proveedores/${id}`, { method: 'DELETE' });
      if (res.ok) {
        Swal.fire('Eliminado', 'Proveedor eliminado correctamente.', 'success')
          .then(() => location.reload());
      } else {
        const err = await res.json();
        Swal.fire('Error', err.error || 'No se pudo eliminar', 'error');
      }
    } catch (error) {
      Swal.fire('Error', 'Error de conexión', 'error');
    }
  }
};

// --- GESTIÓN DE FACTURAS ---

window.abrirFacturas = async function(id, nombre) {
  document.getElementById('facturaProveedorId').value = id;
  document.getElementById('facturaProveedorNombre').innerText = nombre;
  await window.cargarFacturas(id);
  window.ProveedoresModule.modalFacturas.show();
};

window.cargarFacturas = async function(proveedorId) {
  const tbody = document.getElementById('listaFacturasCuerpo');
  const containerMovil = document.getElementById('listaFacturasMovil');
  const msgVacio = document.getElementById('sinFacturasMsg');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div> Cargando...</td></tr>';
  if (containerMovil) containerMovil.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>';

  try {
    const res = await fetch(`/proveedores/${proveedorId}/facturas`);
    const facturas = await res.json();

    tbody.innerHTML = '';
    if (containerMovil) containerMovil.innerHTML = '';

    if (!facturas || facturas.length === 0) {
      msgVacio?.classList.remove('d-none');
      return;
    }

    msgVacio?.classList.add('d-none');
    facturas.forEach(f => {
      const fecha = f.fecha_emision ? new Date(f.fecha_emision).toLocaleDateString() : 'N/A';
      const monto = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(f.monto_total);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="small">${fecha}</td>
        <td class="fw-bold">${f.numero_factura || '-'}</td>
        <td class="text-end fw-bold text-dark">${monto}</td>
        <td class="text-center">
          <a href="/proveedores/facturas/${f.id}/ver" target="_blank" class="btn btn-sm btn-light border" title="Ver archivo">
            <i class="bi bi-file-earmark-pdf text-danger"></i>
          </a>
        </td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-danger border-0" onclick="eliminarFactura(${f.id}, ${proveedorId})" title="Eliminar">
            <i class="bi bi-x-lg"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);

      if (containerMovil) {
        const card = `
          <div class="card border-0 bg-light mb-2 rounded-3 shadow-sm">
            <div class="card-body p-2 px-3">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="small text-muted">${fecha}</span>
                <span class="fw-bold text-success">${monto}</span>
              </div>
              <div class="d-flex justify-content-between align-items-center">
                <div class="small fw-bold text-dark">
                  <i class="bi bi-file-earmark-text me-1"></i>${f.numero_factura || 'S/N'}
                </div>
                <div class="btn-group">
                  <a href="/proveedores/facturas/${f.id}/ver" target="_blank" class="btn btn-sm btn-white border shadow-sm px-3">
                    <i class="bi bi-eye text-primary"></i>
                  </a>
                  <button class="btn btn-sm btn-white border shadow-sm px-3 ms-1" onclick="eliminarFactura(${f.id}, ${proveedorId})">
                    <i class="bi bi-trash text-danger"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
        containerMovil.insertAdjacentHTML('beforeend', card);
      }
    });
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error al cargar facturas</td></tr>';
    if (containerMovil) containerMovil.innerHTML = '<div class="text-center text-danger small">Error al cargar</div>';
  }
};

window.eliminarFactura = async function(facturaId, proveedorId) {
  const result = await Swal.fire({
    title: '¿Eliminar factura?',
    text: "Se borrará el archivo de la base de datos.",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    confirmButtonText: 'Sí, eliminar'
  });

  if (result.isConfirmed) {
    try {
      const res = await fetch(`/proveedores/facturas/${facturaId}`, { method: 'DELETE' });
      if (res.ok) {
        await window.cargarFacturas(proveedorId);
        Swal.fire({ icon: 'success', title: 'Eliminada', timer: 1000, showConfirmButton: false });
      } else {
        throw new Error('No se pudo eliminar');
      }
    } catch (error) {
      Swal.fire('Error', error.message, 'error');
    }
  }
};

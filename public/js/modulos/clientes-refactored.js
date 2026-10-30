/**
 * Clientes Manager - Refactored using modular architecture
 * Manages client CRUD operations
 * Related to: views/clientes.ejs, routes/clientes.js, core/gf.js, modules/FormManager.js, etc.
 */

function mostrarAdvertenciaValidacion(mensaje) {
    GF.alerta(mensaje, null, 'warning');
}

// Client manager class
class ClientManager {
    formManager = null;
    tableManager = null;
    searchManager = null;

    constructor() {
        this.init();
    }

    /**
     * Initialize client manager
     */
    init() {
        // Initialize form manager
        this.formManager = new FormManager({
            modalId: 'clienteModal',
            formId: 'formCliente',
            submitButtonId: 'guardarCliente',
            titleElementId: 'modalTitle',
            createTitle: 'Nuevo Cliente',
            editTitle: 'Editar Cliente',
            resetFields: ['clienteId'],
            onSubmit: (data, isEdit, id) => this.handleSubmit(data, isEdit, id),
            onEdit: (id) => this.handleEdit(id)
        });

        // Initialize table manager (Desktop)
        this.tableManager = new TableManager({
            tableBodyId: 'clientesTabla',
            onEdit: (id) => this.editClient(id),
            onDelete: (id) => this.deleteClient(id)
        });

        // Initialize mobile list manager (New)
        this.mobileManager = new TableManager({
            tableBodyId: 'clientesListaMobile',
            onEdit: (id) => this.editClient(id),
            onDelete: (id) => this.deleteClient(id)
        });

        // Initialize search manager
        const searchInput = document.getElementById('buscarCliente');
        if (searchInput) {
            this.searchManager = new SearchManager(
                searchInput,
                (searchTerm) => this.handleSearch(searchTerm),
                {
                    debounceMs: 300,
                    minLength: 0,
                    onClear: () => this.clearSearch()
                }
            );
        }
    }

    /**
     * Handle form submission
     */
    async handleSubmit(data, isEdit, id) {
        const clientData = {
            tipo_documento: data.tipo_documento || document.getElementById('tipo_documento').value,
            numero_documento: data.numero_documento || document.getElementById('numero_documento').value,
            email: data.email || document.getElementById('email').value,
            nombre: data.nombre || document.getElementById('nombre').value,
            direccion: data.direccion || document.getElementById('direccion').value,
            telefono: (data.telefono || document.getElementById('telefono').value || '').replace(/\D/g, '')
        };

        // Validate required fields
        if (!clientData.nombre || !String(clientData.nombre).trim()) {
            mostrarAdvertenciaValidacion('El nombre es requerido');
            return;
        }

        if (clientData.telefono && !/^\d+$/.test(clientData.telefono)) {
            mostrarAdvertenciaValidacion('El teléfono solo puede contener números');
            return;
        }

        try {
            if (isEdit) {
                await GF.api.put(`/api/clientes/${id}`, clientData);
            } else {
                await GF.api.post('/api/clientes', clientData);
            }

            this.formManager.hide();
            location.reload();
        } catch (error) {
            GF.error(error.message);
        }
    }

    /**
     * Handle edit - load client data
     */
    async handleEdit(id) {
        try {
            const cliente = await GF.api.get(`/api/clientes/${id}`);
            document.getElementById('clienteId').value = cliente.id;
            document.getElementById('tipo_documento').value = cliente.tipo_documento || 'CC';
            document.getElementById('numero_documento').value = cliente.numero_documento || '';
            document.getElementById('email').value = cliente.email || '';
            document.getElementById('nombre').value = cliente.nombre;
            document.getElementById('direccion').value = cliente.direccion || '';
            document.getElementById('telefono').value = cliente.telefono || '';
        } catch (error) {
            GF.error(error.message || 'Error al cargar el cliente');
        }
    }

    /**
     * Edit client
     */
    editClient(id) {
        this.formManager.showEdit(id);
    }

    /**
     * Delete client
     */
    async deleteClient(id) {
        const result = await Swal.fire({
            title: '¿Eliminar cliente?',
            text: 'Las facturas asociadas no se eliminarán, pero el cliente ya no aparecerá en el listado.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc3545',
            cancelButtonColor: '#5b6b7e',
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
        });
        if (!result.isConfirmed) return;

        try {
            await GF.api.delete(`/api/clientes/${id}`);
            await Swal.fire({ icon: 'success', title: 'Cliente eliminado', timer: 1500, showConfirmButton: false });
            location.reload();
        } catch (error) {
            Swal.fire({ icon: 'error', title: error.message || 'Error al eliminar' });
        }
    }

    /**
     * Handle search
     */
    handleSearch(searchTerm) {
        if (this.tableManager) {
            this.tableManager.filterRows((row) => {
                const text = row.textContent.toLowerCase();
                return text.includes(searchTerm);
            }, 'tr');
        }

        if (this.mobileManager) {
            this.mobileManager.filterRows((row) => {
                const text = row.textContent.toLowerCase();
                return text.includes(searchTerm);
            }, '.cliente-card');
        }
    }

    /**
     * Clear search
     */
    clearSearch() {
        if (this.tableManager) this.tableManager.clearFilters('tr');
        if (this.mobileManager) this.mobileManager.clearFilters('.cliente-card');
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.clientManager = new ClientManager();
});

// Export functions for backward compatibility
function editarCliente(id) {
    if (window.clientManager) {
        window.clientManager.editClient(id);
    }
}

function eliminarCliente(id) {
    if (window.clientManager) {
        window.clientManager.deleteClient(id);
    }
}


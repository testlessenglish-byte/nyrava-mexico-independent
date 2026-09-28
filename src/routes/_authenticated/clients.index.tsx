import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { listClients, createClientFn, bulkDeleteClientsFn } from "@/lib/clients.functions";
import { Search, Plus, Users, Building2, User, ChevronLeft, ChevronRight } from "lucide-react";
import { ClientCard } from "@/components/crm/ClientCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/clients/")({
  head: () => ({ meta: [{ title: "Clientes — Nyrava" }] }),
  component: ClientsPage,
});

function ClientsPage() {
  const fetchClients = useServerFn(listClients);
  const createClient = useServerFn(createClientFn);
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [isNewClientOpen, setIsNewClientOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newClient, setNewClient] = useState({ display_name: "", client_type: "individual", email: "" });

  // Reset to page 1 when search or status changes
  useEffect(() => {
    setPage(1);
  }, [query, statusFilter]);

  async function handleCreateClient(e: React.FormEvent) {
    e.preventDefault();
    if (!newClient.display_name.trim()) {
      toast.error("El nombre es requerido");
      return;
    }
    setCreating(true);
    try {
      await createClient({ data: newClient });
      toast.success("Cliente creado exitosamente");
      setIsNewClientOpen(false);
      setNewClient({ display_name: "", client_type: "individual", email: "" });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch (error: any) {
      toast.error(error.message || "Error al crear cliente");
    } finally {
      setCreating(false);
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ["clients", { query, statusFilter, page }],
    queryFn: () => fetchClients({ data: { search: query, status: statusFilter, page } }),
    refetchInterval: 10000,
  });

  const filtered = data?.clients ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / 25));

  const bulkDelete = useServerFn(bulkDeleteClientsFn);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [deletingBulk, setDeletingBulk] = useState(false);

  const handleSelectClient = (id: string, selected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSelectAllOnPage = (selected: boolean) => {
    const pageIds = filtered.map((c: any) => c.id);
    setSelectedIds(prev => {
      const next = new Set(prev);
      pageIds.forEach((id: string) => {
        if (selected) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  const isAllPageSelected = filtered.length > 0 && filtered.every((c: any) => selectedIds.has(c.id));

  const handleBulkDelete = async () => {
    setDeletingBulk(true);
    try {
      const res = await bulkDelete({ data: { clientIds: Array.from(selectedIds) } });
      const { deletedCount, preservedCount } = res;
      if (deletedCount > 0 && preservedCount > 0) {
        toast.warning(`${deletedCount} clientes eliminados. ${preservedCount} no se eliminaron porque tienen expedientes.`);
      } else if (deletedCount > 0) {
        toast.success(`${deletedCount} clientes eliminados.`);
      } else if (preservedCount > 0) {
        toast.error(`0 clientes eliminados. ${preservedCount} no se eliminaron porque tienen expedientes.`);
      }

      setSelectedIds(new Set());
      setIsBulkDeleteOpen(false);
      
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      if (deletedCount >= filtered.length && page > 1) {
        setPage(p => Math.max(1, p - 1));
      }
    } catch (e: any) {
      toast.error(e.message || "Error al eliminar clientes");
    } finally {
      setDeletingBulk(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold sm:text-3xl text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Directorio de Clientes
          </h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
            Administra tus clientes y contactos
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Dialog open={isNewClientOpen} onOpenChange={setIsNewClientOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:opacity-90">
                <Plus className="mr-2 h-4 w-4" />
                Nuevo Cliente
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Agregar Nuevo Cliente</DialogTitle>
              </DialogHeader>
                <form onSubmit={handleCreateClient} className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Nombre / RazÃ³n Social *</label>
                    <Input 
                      placeholder="Ej. Juan PÃ©rez o Empresa S.A." 
                      value={newClient.display_name}
                      onChange={(e) => setNewClient({ ...newClient, display_name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tipo de Cliente</label>
                    <select 
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                      value={newClient.client_type}
                      onChange={(e) => setNewClient({ ...newClient, client_type: e.target.value })}
                    >
                      <option value="individual">Persona FÃ­sica</option>
                      <option value="company">Persona Moral</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Correo ElectrÃ³nico</label>
                    <Input 
                      type="email" 
                      placeholder="correo@ejemplo.com" 
                      value={newClient.email}
                      onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setIsNewClientOpen(false)} disabled={creating}>Cancelar</Button>
                    <Button type="submit" disabled={creating}>
                      {creating ? "Guardando..." : "Guardar"}
                    </Button>
                  </div>
                </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, correo..."
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-shadow"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none sm:w-48"
        >
          <option value="all">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="archived">Archivados</option>
        </select>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Cargando clientes...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h2 className="mt-4 text-lg font-medium text-foreground">
            {query || statusFilter !== "all" ? "No se encontraron resultados" : "No tienes clientes aún"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {query || statusFilter !== "all" ? "Intenta con otros términos de búsqueda." : "Agrega tu primer cliente para comenzar."}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-3">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                checked={isAllPageSelected}
                onChange={(e) => handleSelectAllOnPage(e.target.checked)}
              />
              Seleccionar todos en esta página
            </label>
            
            {selectedIds.size > 0 && (
              <Dialog open={isBulkDeleteOpen} onOpenChange={setIsBulkDeleteOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    Eliminar seleccionados ({selectedIds.size})
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>¿Eliminar {selectedIds.size} clientes seleccionados?</DialogTitle>
                  </DialogHeader>
                  <div className="py-4">
                    <p className="text-sm text-muted-foreground">
                      Esta acción eliminará permanentemente los registros de clientes seleccionados que no tengan expedientes. Los clientes con expedientes no serán eliminados.
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsBulkDeleteOpen(false)} disabled={deletingBulk}>Cancelar</Button>
                    <Button variant="destructive" onClick={handleBulkDelete} disabled={deletingBulk}>
                      {deletingBulk ? "Eliminando..." : "Eliminar clientes"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((client: any) => (
              <ClientCard
                key={client.id}
                id={client.id}
                displayName={client.display_name}
                clientType={client.client_type as "individual" | "company"}
                caseCount={client.case_count || 0}
                email={client.email}
                status={client.status as "active" | "inactive" | "archived"}
                selectionProps={{
                  selected: selectedIds.has(client.id),
                  onSelect: (selected) => handleSelectClient(client.id, selected),
                  disabled: false
                }}
              />
            ))}
          </div>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border pt-4">
            <div className="text-sm text-muted-foreground">
              Mostrando {(page - 1) * 25 + 1}–{Math.min(page * 25, totalCount)} de {totalCount} clientes
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Anterior
              </Button>
              <div className="text-sm font-medium">
                Página {page} de {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Siguiente
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}





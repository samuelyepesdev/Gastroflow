-- 136_usuarios_nav_oculto.sql
-- Personalizar el menu: cada usuario puede ocultar enlaces de su barra de navegacion.
-- nav_oculto guarda una lista JSON con las claves de los enlaces ocultos. Es solo visual: no cambia ningun permiso.
-- NULL = muestra todo lo que su rol y su plan permiten.

ALTER TABLE usuarios ADD COLUMN nav_oculto TEXT NULL;

export const supportedLocales = ['es', 'en', 'fr'] as const;
export type Locale = (typeof supportedLocales)[number];

export const localeDetails: Record<
	Locale,
	{ label: string; nativeLabel: string; tag: string }
> = {
	es: { label: 'Español', nativeLabel: 'Español', tag: 'es-DO' },
	en: { label: 'Inglés', nativeLabel: 'English', tag: 'en-US' },
	fr: { label: 'Francés', nativeLabel: 'Français', tag: 'fr-FR' },
};

type Translation = readonly [spanish: string, english: string, french: string];

const badgeLabels: Record<string, string> = {
	DRAFT: 'Borrador', SUBMITTED: 'Por aprobar', UNDER_REVIEW: 'En revisión', CHANGES_REQUESTED: 'Requiere cambios',
	APPROVED: 'Aprobada', REJECTED: 'Rechazada', CANCELLED: 'Cancelada', COMPLETED: 'Completada',
	PENDING: 'Pendiente', CRITICAL: 'Crítico', HIGH: 'Alto', WARNING: 'Aviso',
	ELDER_ASSIGNMENT: 'Turno de ancianos', ELDER_PROGRAM: 'Programa de culto', SCHEDULED: 'Programado', LOW: 'Bajo',
};

export function badgeStatusLabel(status: string): string {
	return Object.hasOwn(badgeLabels, status) ? badgeLabels[status]! : status;
}

const entries: Translation[] = [
	['GestionChurch · Coordinación con propósito', 'GestionChurch · Purposeful coordination', 'GestionChurch · Coordination porteuse de sens'],
	['GestionChurch · Página principal', 'GestionChurch · Home page', 'GestionChurch · Page d’accueil'],
	['Organiza el calendario, conecta los departamentos y da seguimiento a los programas de tu iglesia con GestionChurch.', 'Organize your church’s calendar, connect departments, and track programs with GestionChurch.', 'Organisez le calendrier de votre église, reliez les départements et suivez les programmes avec GestionChurch.'],
	['Funcionalidades', 'Features', 'Fonctionnalités'],
	['Una iglesia. Un mismo propósito.', 'One church. One shared purpose.', 'Une église. Un même objectif.'],
	['Más orden.', 'Better organization.', 'Plus d’organisation.'],
	['Más tiempo para la misión.', 'More time for the mission.', 'Plus de temps pour la mission.'],
	['Conecta a tus departamentos, organiza el calendario y acompaña cada programa desde un solo lugar.', 'Connect your departments, organize the calendar, and support every program in one place.', 'Reliez vos départements, organisez le calendrier et accompagnez chaque programme au même endroit.'],
	['Ingresar a mi iglesia', 'Sign in to my church', 'Me connecter à mon église'],
	['Explorar funcionalidades', 'Explore features', 'Découvrir les fonctionnalités'],
	['Cada iglesia, su propio espacio', 'Every church has its own space', 'Chaque église a son propre espace'],
	['Del plan a la acción', 'From planning to action', 'Du projet à l’action'],
	['Planifica', 'Plan', 'Planifiez'],
	['Define actividades y responsables.', 'Define activities and who is responsible.', 'Définissez les activités et leurs responsables.'],
	['Coordina', 'Coordinate', 'Coordonnez'],
	['Revisa fechas y acuerdos.', 'Review dates and agreements.', 'Examinez les dates et les accords.'],
	['Da seguimiento', 'Track progress', 'Assurez le suivi'],
	['Acompaña el avance de cada programa.', 'Support the progress of every program.', 'Accompagnez l’avancement de chaque programme.'],
	['Departamentos conectados, decisiones claras.', 'Connected departments, clear decisions.', 'Des départements connectés, des décisions claires.'],
	['Todo conectado. Todo con propósito.', 'Everything connected. Everything with purpose.', 'Tout est connecté. Tout a un sens.'],
	['Planificación, colaboración y seguimiento para servir con claridad.', 'Planning, collaboration, and progress tracking to serve with clarity.', 'Planification, collaboration et suivi pour servir avec clarté.'],
	['Un calendario compartido', 'A shared calendar', 'Un calendrier partagé'],
	['Propón fechas, detecta coincidencias y lleva las decisiones a revisión antes de publicar.', 'Suggest dates, spot overlaps, and submit decisions for review before publishing.', 'Proposez des dates, repérez les chevauchements et soumettez les décisions à un examen avant publication.'],
	['Un espacio para cada ministerio', 'A space for every ministry', 'Un espace pour chaque ministère'],
	['Equipos, programas, documentos y presupuestos conectados al trabajo de tu iglesia.', 'Teams, programs, documents, and budgets connected to your church’s work.', 'Des équipes, des programmes, des documents et des budgets reliés au travail de votre église.'],
	['Seguimiento que da claridad', 'Progress tracking that brings clarity', 'Un suivi qui apporte de la clarté'],
	['Tareas, avances, reportes y alertas para saber qué sigue y qué necesita atención.', 'Tasks, progress, reports, and alerts to see what comes next and what needs attention.', 'Des tâches, des avancées, des rapports et des alertes pour savoir quelle est la suite et ce qui demande votre attention.'],
	['Al servicio de la misión', 'Serving the mission', 'Au service de la mission'],
	['Organizar también es cuidar.', 'Organization is also a form of care.', 'Organiser, c’est aussi prendre soin.'],
	['Desarrollado por', 'Developed by', 'Développé par'],
	['Idara Global Technologies (abre en una nueva pestaña)', 'Idara Global Technologies (opens in a new tab)', 'Idara Global Technologies (s’ouvre dans un nouvel onglet)'],
	['Recuperación de contraseña', 'Password recovery', 'Récupération du mot de passe'],
	['Enlace vencido', 'Expired link', 'Lien expiré'],
	['Enlace ya utilizado', 'Link already used', 'Lien déjà utilisé'],
	['Cuenta inactiva', 'Inactive account', 'Compte inactif'],
	['Reintento no disponible', 'Retry unavailable', 'Nouvelle tentative indisponible'],
	['Válido hasta:', 'Valid until:', 'Valide jusqu’au :'],
	['Guardando borrador…', 'Saving draft…', 'Enregistrement du brouillon…'],
	['Guardar borrador conserva los datos completos y el programa confirmado sin enviarlos ni reservar fechas. Continúa desde el detalle después de guardar.', 'Save draft keeps the complete details and confirmed program without submitting them or reserving dates. Continue from the activity details after saving.', 'Enregistrer le brouillon conserve les informations complètes et le programme confirmé sans les soumettre ni réserver de dates. Continuez depuis le détail de l’activité après l’enregistrement.'],
	['Los campos incompletos y los archivos sin confirmar solo permanecen en esta pestaña; no se recuperan al recargar o cerrar.', 'Incomplete fields and unconfirmed files remain only in this tab; they cannot be recovered after reloading or closing it.', 'Les champs incomplets et les fichiers non confirmés restent uniquement dans cet onglet ; ils ne sont pas récupérables après un rechargement ou une fermeture.'],
	['No fue posible guardar el borrador.', 'Could not save the draft.', 'Impossible d’enregistrer le brouillon.'],
	['Respuestas del formulario guardado', 'Saved form responses', 'Réponses du formulaire enregistré'],
	['Se utiliza el formulario de esta actividad, no la plantilla publicada actualmente.', 'This activity’s saved form is used, not the currently published template.', 'Le formulaire enregistré pour cette activité est utilisé, et non le modèle actuellement publié.'],
	['Artista', 'Artist', 'Artiste'],
	['Fuente:', 'Source:', 'Source :'],
	['Operaciones departamentales', 'Department operations', 'Opérations départementales'],
	['No fue posible cargar esta cola', 'Could not load this queue', 'Impossible de charger cette file'],
	['La tendencia reciente requiere intervención del equipo.', 'The recent trend requires team intervention.', 'La tendance récente nécessite une intervention de l’équipe.'],
	['La ejecución requiere seguimiento preventivo.', 'Execution requires preventive follow-up.', 'L’exécution nécessite un suivi préventif.'],
	['Supervisa las fechas y confirma los cierres en el expediente.', 'Monitor dates and confirm completions in the activity record.', 'Surveillez les dates et confirmez les clôtures dans le dossier de l’activité.'],
	['Medio', 'Medium', 'Moyen'],
	['Indicador heurístico reciente', 'Recent heuristic indicator', 'Indicateur heuristique récent'],
	['Muestra reciente:', 'Recent sample:', 'Échantillon récent :'],
	['iniciativas completadas. Basado en fecha prevista y última actualización; no valida puntualidad ni predice resultados.', 'completed initiatives. Based on the planned date and last update; it does not validate timeliness or predict results.', 'initiatives terminées. Basé sur la date prévue et la dernière mise à jour ; ne valide pas la ponctualité et ne prédit pas les résultats.'],
	['LECTURA OPERATIVA', 'OPERATIONAL OVERVIEW', 'BILAN OPÉRATIONNEL'],
	['Cumplimiento observado', 'Observed completion', 'Réalisation observée'],
	['Indicador descriptivo, no una predicción validada.', 'Descriptive indicator, not a validated prediction.', 'Indicateur descriptif, pas une prédiction validée.'],
	['Iniciativas completadas:', 'Completed initiatives:', 'Initiatives terminées :'],
	['Puntualidad observada', 'Observed timeliness', 'Ponctualité observée'],
	['cierres con evidencia temporal;', 'completions with timing evidence;', 'clôtures avec des données temporelles ;'],
	['sin evidencia temporal.', 'without timing evidence.', 'sans données temporelles.'],
	['Solicitud de actividad', 'Activity request', 'Demande d’activité'],
	['Completa la información para coordinar, revisar y calendarizar la actividad.', 'Complete the details to coordinate, review and schedule the activity.', 'Renseignez les informations pour coordonner, examiner et planifier l’activité.'],
	['Crear y enviar', 'Create and submit', 'Créer et soumettre'],
	['Foto de', 'Photo of', 'Photo de'],
	['Cobertura completada', 'Completed coverage', 'Couverture terminée'],
	['Cobertura cancelada', 'Cancelled coverage', 'Couverture annulée'],
	['Acceso protegido por sesión', 'Session-protected access', 'Accès protégé par une session'],
	['Configura, prueba y supervisa tus canales.', 'Configure, test and monitor your channels.', 'Configurez, testez et surveillez vos canaux.'],
	['Tu sesión expiró', 'Your session expired', 'Votre session a expiré'],
	['Los datos y archivos siguen en memoria en esta pestaña. No se guardaron en el dispositivo ni se reenviará ninguna solicitud automáticamente.', 'Your details and files remain in memory in this tab. They were not saved on the device and no request will be resent automatically.', 'Vos données et fichiers restent en mémoire dans cet onglet. Ils n’ont pas été enregistrés sur l’appareil et aucune demande ne sera renvoyée automatiquement.'],
	['Inicia sesión con la misma cuenta e iglesia en otra pestaña. Después comprueba la sesión para continuar; los permisos se verificarán de nuevo.', 'Sign in with the same account and church in another tab. Then check the session to continue; permissions will be checked again.', 'Connectez-vous avec le même compte et la même église dans un autre onglet. Vérifiez ensuite la session pour continuer ; les autorisations seront vérifiées à nouveau.'],
	['Sesión sin confirmar', 'Unconfirmed session', 'Session non confirmée'],
	['Abrir acceso en otra pestaña', 'Open sign-in in another tab', 'Ouvrir la connexion dans un autre onglet'],
	['Comprobando sesión…', 'Checking session…', 'Vérification de la session…'],
	['Comprobar sesión y continuar', 'Check session and continue', 'Vérifier la session et continuer'],
	['Descartar y volver al acceso', 'Discard and return to sign-in', 'Abandonner et revenir à la connexion'],
	['Recargar o cerrar esta pestaña pierde la recuperación en memoria. Salir no cancela una solicitud ya enviada.', 'Reloading or closing this tab loses in-memory recovery. Leaving does not cancel a request already sent.', 'Recharger ou fermer cet onglet supprime la récupération en mémoire. Quitter n’annule pas une demande déjà envoyée.'],
	['Cambió la cuenta o la iglesia', 'The account or church changed', 'Le compte ou l’église a changé'],
	['Borrador y archivos descartados', 'Draft and files discarded', 'Brouillon et fichiers supprimés'],
	['El estado de la cuenta anterior se eliminó de esta pestaña para evitar compartir información entre identidades. No se reintentó ninguna operación.', 'The previous account’s state was removed from this tab to prevent sharing information between identities. No operation was retried.', 'L’état du compte précédent a été supprimé de cet onglet afin de ne pas partager d’informations entre identités. Aucune opération n’a été réessayée.'],
	['Ir al inicio', 'Go to home', 'Aller à l’accueil'],
	['No pudimos verificar la identidad de la sesión.', 'We could not verify the session identity.', 'Impossible de vérifier l’identité de la session.'],
	['La sesión todavía no está disponible. Inicia sesión y vuelve a comprobar.', 'The session is not available yet. Sign in and check again.', 'La session n’est pas encore disponible. Connectez-vous et vérifiez à nouveau.'],
	['Se descartarán los datos y archivos de esta pestaña. ¿Continuar?', 'The details and files in this tab will be discarded. Continue?', 'Les données et fichiers de cet onglet seront supprimés. Continuer ?'],
	['La sesión debe verificarse antes de continuar.', 'The session must be verified before continuing.', 'La session doit être vérifiée avant de continuer.'],
	['Cambió la identidad. No se reintentó ninguna operación.', 'The identity changed. No operation was retried.', 'L’identité a changé. Aucune opération n’a été réessayée.'],
	['Indica una razón operativa de 10 a 500 caracteres, sin datos sensibles.', 'Provide an operational reason of 10 to 500 characters, without sensitive details.', 'Indiquez une raison opérationnelle de 10 à 500 caractères, sans données sensibles.'],
	['No pudimos confirmar la reprogramación. Actualiza la cola antes de reintentar.', 'We could not confirm rescheduling. Refresh the queue before retrying.', 'Impossible de confirmer la reprogrammation. Actualisez la file avant de réessayer.'],
	['No fue posible cargar la cola de publicaciones.', 'The publication queue could not be loaded.', 'Impossible de charger la file des publications.'],
	['No fue posible cargar la cola de publicaciones', 'The publication queue could not be loaded', 'Impossible de charger la file des publications'],
	['Publicación reprogramada con el mismo identificador. La entrega todavía no está confirmada.', 'Publication rescheduled with the same identifier. Delivery is not confirmed yet.', 'Publication reprogrammée avec le même identifiant. La livraison n’est pas encore confirmée.'],
	['No fue posible reprogramar la publicación.', 'The publication could not be rescheduled.', 'Impossible de reprogrammer la publication.'],
	['No fue posible reprogramar la publicación', 'The publication could not be rescheduled', 'Impossible de reprogrammer la publication'],
	['Reintento programado', 'Retry scheduled', 'Nouvelle tentative programmée'],
	['Cola de publicaciones agotadas', 'Exhausted publication queue', 'File des publications épuisées'],
	['Publicaciones que agotaron sus intentos', 'Publications with exhausted retries', 'Publications ayant épuisé leurs tentatives'],
	['Solo metadatos operativos. Reprogramar no confirma una entrega ni crea otro evento.', 'Operational metadata only. Rescheduling does not confirm delivery or create another event.', 'Métadonnées opérationnelles uniquement. Reprogrammer ne confirme pas la livraison et ne crée pas un autre événement.'],
	['Actualizar cola', 'Refresh queue', 'Actualiser la file'],
	['Publicación pendiente', 'Pending publication', 'Publication en attente'],
	['Evento:', 'Event:', 'Événement :'],
	['Recurso:', 'Resource:', 'Ressource :'],
	['intentos', 'attempts', 'tentatives'],
	['Reprogramar publicación', 'Reschedule publication', 'Reprogrammer la publication'],
	['Sin publicaciones agotadas', 'No exhausted publications', 'Aucune publication épuisée'],
	['Esta cola no contiene eventos pendientes con los intentos agotados.', 'This queue has no pending events with exhausted retries.', 'Cette file ne contient aucun événement en attente ayant épuisé ses tentatives.'],
	['Confirmar reprogramación', 'Confirm rescheduling', 'Confirmer la reprogrammation'],
	['Se volverá a intentar la publicación del mismo evento. El procesamiento es asíncrono y la entrega no está garantizada.', 'Publication of the same event will be retried. Processing is asynchronous and delivery is not guaranteed.', 'La publication du même événement sera réessayée. Le traitement est asynchrone et la livraison n’est pas garantie.'],
	['Razón operativa del reintento', 'Operational reason for retrying', 'Raison opérationnelle de la nouvelle tentative'],
	['Confirmar y reprogramar', 'Confirm and reschedule', 'Confirmer et reprogrammer'],
	['Comisión de Nombramientos (asignación histórica)', 'Nombramientos commission (historical assignment)', 'Commission de Nombramientos (affectation historique)'],
	['Conserva la participación histórica en comisión; no incluye custodia de escrutinio.', 'Preserves historical commission participation; does not include ballot custody.', 'Conserve la participation historique à la commission sans inclure la garde du dépouillement.'],
	['Editar asignaciones', 'Edit assignments', 'Modifier les affectations'],
	['Conserva al menos un rol para esta cuenta.', 'Keep at least one role for this account.', 'Conservez au moins un rôle pour ce compte.'],
	['La cuenta ya no está disponible. Actualiza el equipo.', 'The account is no longer available. Refresh the team.', 'Le compte n’est plus disponible. Actualisez l’équipe.'],
	['Asignaciones actualizadas. Los departamentos y demás datos se conservaron.', 'Assignments updated. Departments and other details were preserved.', 'Affectations mises à jour. Les départements et les autres données ont été conservés.'],
	['No fue posible actualizar las asignaciones.', 'The assignments could not be updated.', 'Impossible de mettre à jour les affectations.'],
	['Asignaciones explícitas de Nombramientos', 'Explicit Nombramientos assignments', 'Affectations explicites de Nombramientos'],
	['Solo se modificarán los roles seleccionados. Los departamentos, cargos y datos personales se conservan.', 'Only selected roles will change. Departments, appointments and personal details are preserved.', 'Seuls les rôles sélectionnés seront modifiés. Les départements, les fonctions et les données personnelles sont conservés.'],
	['Roles de la cuenta', 'Account roles', 'Rôles du compte'],
	['Otros roles conservados', 'Other preserved roles', 'Autres rôles conservés'],
	['Se retirará la administración del tenant', 'Tenant administration will be removed', 'L’administration de l’église sera retirée'],
	['Comprueba que otra cuenta autorizada podrá seguir administrando el equipo.', 'Check that another authorized account can continue managing the team.', 'Vérifiez qu’un autre compte autorisé pourra continuer à administrer l’équipe.'],
	['Guardar asignaciones', 'Save assignments', 'Enregistrer les affectations'],
	['Acceso a Nombramientos', 'Nombramientos access', 'Accès à Nombramientos'],
	['Abre Nombramientos; no asigna pertenencia a comisión ni custodia de escrutinio.', 'Opens Nombramientos; does not assign commission membership or ballot custody.', 'Ouvre Nombramientos sans attribuer l’appartenance à la commission ni la garde du dépouillement.'],
	['Miembro de comisión de Nombramientos', 'Nombramientos commission member', 'Membre de la commission de Nombramientos'],
	['Custodio de escrutinio de Nombramientos', 'Nombramientos ballot custodian', 'Responsable du dépouillement de Nombramientos'],
	['Participa en la comisión de Nombramientos mediante una asignación explícita.', 'Participates in the Nombramientos commission through an explicit assignment.', 'Participe à la commission de Nombramientos par une affectation explicite.'],
	['Custodia el escrutinio de Nombramientos mediante una asignación explícita.', 'Manages Nombramientos ballot custody through an explicit assignment.', 'Assure la garde du dépouillement de Nombramientos par une affectation explicite.'],
	['Cumpleaños pendientes de verificar', 'Birthdays awaiting verification', 'Anniversaires en attente de vérification'],
	['Actualiza el padrón para recuperar el grupo exacto de cumpleaños.', 'Refresh the roster to retrieve the exact birthday group.', 'Actualisez la liste pour obtenir le groupe exact des anniversaires.'],
	['No fue posible provisionar el tenant.', 'The tenant could not be provisioned.', 'Impossible de provisionner l’église.'],
	['Presupuestos por moneda', 'Budgets by currency', 'Budgets par devise'],
	['No se suman monedas distintas ni se aplica una conversión de cambio.', 'Different currencies are not added together or converted.', 'Les différentes devises ne sont ni additionnées ni converties.'],
	['Movimientos sin moneda atribuible', 'Transactions without an attributable currency', 'Mouvements sans devise attribuable'],
	['Enlaza estos movimientos a una iniciativa para identificar su moneda.', 'Link these transactions to an initiative to identify their currency.', 'Rattachez ces mouvements à une initiative pour identifier leur devise.'],
	['Resumen de la agenda', 'Agenda overview', 'Vue d’ensemble du calendrier'],
	['Tu calendario y equipos, en un lugar.', 'Your calendar and teams, in one place.', 'Votre calendrier et vos équipes, au même endroit.'],
	['Consulta la agenda y el historial antes de evaluar la coordinación.', 'Review the agenda and history before assessing coordination.', 'Consultez le calendrier et l’historique avant d’évaluer la coordination.'],
	['Consulta el calendario para organizar las próximas actividades.', 'Check the calendar to organize upcoming activities.', 'Consultez le calendrier pour organiser les prochaines activités.'],
	['Indicador heurístico de coordinación', 'Heuristic coordination indicator', 'Indicateur heuristique de coordination'],
	['Evidencia insuficiente', 'Insufficient evidence', 'Données insuffisantes'],
	['Orientación basada en reglas, no una medición validada.', 'Rule-based guidance, not a validated measurement.', 'Orientation fondée sur des règles, et non une mesure validée.'],
	['No fue posible abrir el Ministerio de la Mujer.', 'The Women’s Ministry could not be opened.', 'Impossible d’ouvrir le ministère des femmes.'],
	['Perfil agregado al roster ministerial.', 'Profile added to the ministry roster.', 'Profil ajouté à la liste du ministère.'],
	['Saludo y acompañamiento de cumpleaños', 'Birthday greeting and support', 'Vœux et accompagnement d’anniversaire'],
	['años ·', 'years ·', 'ans ·'],
	['Última participación:', 'Last participation:', 'Dernière participation :'],
	['Sin participación registrada', 'No participation recorded', 'Aucune participation enregistrée'],
	['participación(es) ·', 'participation(s) ·', 'participation(s) ·'],
	['Guardar perfil', 'Save profile', 'Enregistrer le profil'],
	['Guardar movimiento', 'Save transaction', 'Enregistrer le mouvement'],
	['Guardar participación', 'Save participation', 'Enregistrer la participation'],
	['Crear retiro', 'Create retreat', 'Créer la retraite'],
	['Guardar inscripción', 'Save registration', 'Enregistrer l’inscription'],
	['Solicitud pendiente de confirmar', 'Request awaiting confirmation', 'Demande en attente de confirmation'],
	['Se conservarán los mismos datos al reintentar, sin crear otra actividad.', 'Retrying will keep the same details without creating another activity.', 'La nouvelle tentative conservera les mêmes données sans créer une autre activité.'],
	['Abrir actividad guardada', 'Open saved activity', 'Ouvrir l’activité enregistrée'],
	['Reintentar confirmación', 'Retry confirmation', 'Réessayer la confirmation'],
	['El pago sigue sin confirmarse. Reintenta los mismos datos para evitar duplicarlo.', 'The payment is still unconfirmed. Retry the same details to avoid duplicating it.', 'Le paiement reste non confirmé. Réessayez avec les mêmes données pour éviter un doublon.'],
	['Hay una solicitud sin confirmar. Reintenta con los mismos datos antes de iniciar otra.', 'A request remains unconfirmed. Retry the same details before starting another.', 'Une demande reste non confirmée. Réessayez avec les mêmes données avant d’en commencer une autre.'],
	['La actividad del calendario necesita coordinación antes de enlazarse al ministerio. Abre su detalle para continuar.', 'The calendar activity needs coordination before linking it to the ministry. Open its details to continue.', 'L’activité du calendrier nécessite une coordination avant son rattachement au ministère. Ouvrez son détail pour continuer.'],
	['El adjunto sigue sin confirmarse. Reintenta el mismo archivo antes de reemplazarlo.', 'The attachment remains unconfirmed. Retry the same file before replacing it.', 'La pièce jointe reste non confirmée. Réessayez le même fichier avant de le remplacer.'],
	['Abrir las actividades que determinan la salud operativa:', 'Open the activities determining operational health:', 'Ouvrir les activités qui déterminent la santé opérationnelle :'],
	['actividades planificadas de', 'planned activities in', 'activités planifiées de'],
	['Visor de', 'Viewer for', 'Visionneuse de'],
	['Vista previa de', 'Preview of', 'Aperçu de'],
	['Cerrar cobertura de', 'Close coverage for', 'Clôturer l’accompagnement de'],
	['Publicar calendario', 'Publish calendar', 'Publier le calendrier'],
	['iniciativa(s) requieren atención', 'initiative(s) need attention', 'initiative(s) nécessitent une attention'],
	['Acompaña', 'Supporting', 'Accompagne'],
	['Próximo contacto:', 'Next contact:', 'Prochain contact :'],
	['Etapa de', 'Stage for', 'Étape de'],
	['Explorar las', 'Explore the', 'Explorer les'],
	['días de anticipación', 'days of lead time', 'jours d’anticipation'],
	['años', 'years', 'ans'],
	['filas válidas', 'valid rows', 'lignes valides'],
	['Quitar asignación', 'Remove assignment', 'Retirer l’affectation'],
	['Gráfico semestral. Desplaza horizontalmente para explorar los meses.', 'Six-month chart. Scroll horizontally to explore the months.', 'Graphique semestriel. Faites défiler horizontalement pour explorer les mois.'],
	['No fue posible verificar la disponibilidad. La fecha se validará al enviar.', 'Unable to check availability. The date will be validated on submission.', 'Impossible de vérifier la disponibilité. La date sera validée lors de l’envoi.'],
	['Disponibilidad sin confirmar', 'Availability not confirmed', 'Disponibilité non confirmée'],
	['Verificando disponibilidad…', 'Checking availability…', 'Vérification de la disponibilité…'],
	['está disponible:', 'is available:', 'est disponible :'],
	['Actividad con varias sesiones', 'Activity with multiple sessions', 'Activité à plusieurs séances'],
	['Solo modificas el primer bloque de la opción seleccionada. Las demás sesiones, alternativas y tiempos de preparación se conservan.', 'You are only editing the first block of the selected option. Other sessions, alternatives and setup times are preserved.', 'Vous ne modifiez que le premier créneau de l’option sélectionnée. Les autres séances, alternatives et temps de préparation sont conservés.'],
	['MB · versión', 'MB · version', 'Mo · version'],
	['No fue posible cargar el calendario.', 'Unable to load the calendar.', 'Impossible de charger le calendrier.'],
	['Calendario parcialmente disponible', 'Calendar partially available', 'Calendrier partiellement disponible'],
	['Algunas agendas no pudieron cargarse. Los resultados visibles pueden estar incompletos.', 'Some schedules could not be loaded. Visible results may be incomplete.', 'Certains agendas n’ont pas pu être chargés. Les résultats affichés peuvent être incomplets.'],
	['de', 'of', 'sur'],
	['Cobertura pastoral no disponible', 'Pastoral coverage unavailable', 'Accompagnement pastoral indisponible'],
	['No fue posible cargar esta agenda. No se considera una agenda vacía.', 'Unable to load this schedule. It is not considered empty.', 'Impossible de charger cet agenda. Il n’est pas considéré comme vide.'],
	['Señal operativa orientativa', 'Indicative operational signal', 'Indicateur opérationnel indicatif'],
	['puntos orientativos', 'indicative points', 'points indicatifs'],
	['Heurística basada en reglas. No es una probabilidad calibrada ni garantiza un resultado.', 'Rule-based heuristic. It is not a calibrated probability and does not guarantee an outcome.', 'Heuristique fondée sur des règles. Ce n’est pas une probabilité calibrée et elle ne garantit aucun résultat.'],
	['Evidencia', 'Evidence', 'Éléments disponibles'],
	['Historial insuficiente', 'Insufficient history', 'Historique insuffisant'],
	['Historial limitado', 'Limited history', 'Historique limité'],
	['· versión', '· version', '· version'],
	['Por', 'By', 'Par'],
	['anciano(s)', 'elder(s)', 'ancien(s)'],
	['al', 'to', 'au'],
	['Coincide visualmente con', 'Visually overlaps with', 'Coïncide visuellement avec'],
	['actividad(es), sin conflicto.', 'activity/activities, without a conflict.', 'activité(s), sans conflit.'],
	['Base: últimas', 'Based on the last', 'Base : les dernières'],
	['iniciativas completadas. El pronóstico es orientativo y nunca sustituye el criterio de la dirección.', 'completed initiatives. The forecast is indicative and never replaces leadership judgment.', 'initiatives terminées. La prévision est indicative et ne remplace jamais le jugement de la direction.'],
	['Disponible de', 'Available from', 'Disponible sur'],
	['actividad(es) proyectan sobreejecución', 'activity/activities project an overrun', 'activité(s) prévoient un dépassement'],
	['% del total', '% of the total', '% du total'],
	['Se crearán', 'Will create', 'Création de'],
	['invitaciones individuales con seguimiento.', 'individual invitations with tracking.', 'invitations individuelles avec suivi.'],
	['Los usuarios continúan usando la versión', 'Users continue using version', 'Les utilisateurs continuent d’utiliser la version'],
	['hasta que publiques el borrador.', 'until you publish the draft.', 'jusqu’à la publication du brouillon.'],
	['Volver al diseñador', 'Back to the designer', 'Retour au concepteur'],
	['Administración global ·', 'Global administration ·', 'Administration globale ·'],
	['Canales de', 'Channels for', 'Canaux de'],
	['válidas ·', 'valid ·', 'valides ·'],
	['con error', 'with errors', 'avec erreurs'],
	['asistieron de', 'attended out of', 'présentes sur'],
	['La actividad no tiene un bloque de horario editable.', 'The activity has no editable time block.', 'L’activité n’a aucun créneau horaire modifiable.'],
	['Esta serie requiere una edición de calendario completa. No se descartará ninguna sesión.', 'This series requires full calendar editing. No sessions will be discarded.', 'Cette série nécessite une édition complète du calendrier. Aucune séance ne sera supprimée.'],
	['eventos · Página', 'events · Page', 'événements · Page'],
	['Tienes cambios sin guardar. ¿Salir y descartarlos?', 'You have unsaved changes. Leave and discard them?', 'Vous avez des modifications non enregistrées. Quitter et les abandonner ?'],
	['Espera a que termine la operación. Salir no cancela una solicitud ya enviada.', 'Wait for the operation to finish. Leaving does not cancel a request already sent.', 'Attendez la fin de l’opération. Quitter n’annule pas une requête déjà envoyée.'],
	['Preferencias aplicadas en este dispositivo', 'Preferences applied on this device', 'Préférences appliquées sur cet appareil'],
	['Las preferencias siguen activas en este dispositivo, pero no pudimos sincronizarlas.', 'Preferences remain active on this device, but we could not sync them.', 'Les préférences restent actives sur cet appareil, mais nous n’avons pas pu les synchroniser.'],
	['Turno de ancianos', 'Elder rotation', 'Tour de service des anciens'],
	['Programa de culto', 'Worship program', 'Programme du culte'],
	['Programado', 'Scheduled', 'Programmé'],
	['Bajo', 'Low', 'Faible'],
	['Invitaciones', 'Invitations', 'Invitations'],
	['Cerradas', 'Closed', 'Clôturées'],
	['Ver recorrido misionero', 'View missionary journey', 'Voir le parcours missionnaire'],
	['Abrir plan estratégico', 'Open strategic plan', 'Ouvrir le plan stratégique'],
	['Estudios programados', 'Scheduled studies', 'Études programmées'],
	['Grupos activos', 'Active groups', 'Groupes actifs'],
	['Bautizados', 'Baptized', 'Baptisés'],
	['Interesados y estudios', 'Interested people and studies', 'Personnes intéressées et études'],
	['Minutos misioneros', 'Missionary minutes', 'Minutes missionnaires'],
	['Evangelismo', 'Evangelism', 'Évangélisation'],
 ['Volver al calendario', 'Back to calendar', 'Retour au calendrier'],
 ['No hay departamentos disponibles para crear una actividad. Solicita la asignación de un departamento.', 'No departments are available to create an activity. Request a department assignment.', 'Aucun département n’est disponible pour créer une activité. Demandez une affectation à un département.'],
 ['No fue posible cargar el formulario de actividad.', 'Unable to load the activity form.', 'Impossible de charger le formulaire d’activité.'],
 ['Formulario no disponible', 'Form unavailable', 'Formulaire indisponible'],
 ['Actividad guardada como borrador', 'Activity saved as a draft', 'Activité enregistrée comme brouillon'],
 ['La actividad ya está guardada. Reintenta el adjunto o el envío; puedes editar sus datos en el detalle.', 'The activity has already been saved. Retry the attachment or submission; you can edit its information in the details.', 'L’activité est déjà enregistrée. Réessayez la pièce jointe ou l’envoi ; vous pouvez modifier ses informations dans la fiche détaillée.'],
 ['Reintentar envío', 'Retry submission', 'Réessayer l’envoi'],
 ['No fue posible cargar las notificaciones.', 'Unable to load notifications.', 'Impossible de charger les notifications.'],
 ['No fue posible cargar las preferencias.', 'Unable to load preferences.', 'Impossible de charger les préférences.'],
 ['No fue posible actualizar la notificación.', 'Unable to update the notification.', 'Impossible de mettre à jour la notification.'],
 ['No fue posible guardar las preferencias.', 'Unable to save preferences.', 'Impossible d’enregistrer les préférences.'],
 ['No fue posible reintentar la entrega.', 'Unable to retry delivery.', 'Impossible de réessayer la livraison.'],
 ['Necesitas un enlace de recuperación para cambiar tu contraseña.', 'You need a recovery link to change your password.', 'Vous avez besoin d’un lien de récupération pour changer votre mot de passe.'],
 ['Solicitar enlace de recuperación', 'Request recovery link', 'Demander un lien de récupération'],
 ['La solicitud tardó demasiado. No pudimos confirmar su resultado; comprueba el estado antes de reintentar.', 'The request took too long. We could not confirm the result; check the status before trying again.', 'La requête a pris trop de temps. Nous n’avons pas pu confirmer le résultat ; vérifiez l’état avant de réessayer.'],
 ['Introduce fechas válidas para consultar la auditoría.', 'Enter valid dates to view the audit log.', 'Saisissez des dates valides pour consulter le journal d’audit.'],
 ['La fecha final debe ser igual o posterior a la fecha inicial.', 'The end date must be on or after the start date.', 'La date de fin doit être égale ou postérieure à la date de début.'],
 ['Revisa las fechas', 'Check the dates', 'Vérifiez les dates'],
 ['Actualizando auditoría…', 'Updating audit log…', 'Actualisation du journal d’audit…'],
 ['Ocultar detalles', 'Hide details', 'Masquer les détails'],
 ['Ver detalles', 'View details', 'Voir les détails'],
	['Preferencias de lectura y navegación', 'Reading and navigation preferences', 'Préférences de lecture et de navigation'],
	['No fue posible cargar la sesión', 'Unable to load the session', 'Impossible de charger la session'],
	['No fue posible cargar la sesión. Comprueba tu conexión y vuelve a intentar.', 'Unable to load the session. Check your connection and try again.', 'Impossible de charger la session. Vérifiez votre connexion et réessayez.'],
	['No fue posible cerrar la sesión', 'Unable to sign out', 'Impossible de se déconnecter'],
	['No fue posible cerrar la sesión. Vuelve a intentar.', 'Unable to sign out. Try again.', 'Impossible de se déconnecter. Réessayez.'],
	['Cerrando sesión…', 'Signing out…', 'Déconnexion…'],
	['Accesibilidad', 'Accessibility', 'Accessibilité'],
	[
		'Abrir accesibilidad e idiomas',
		'Open accessibility and languages',
		'Ouvrir l’accessibilité et les langues',
	],
	['Cerrar accesibilidad', 'Close accessibility', 'Fermer l’accessibilité'],
	[
		'Preferencias de experiencia',
		'Experience preferences',
		'Préférences d’expérience',
	],
	[
		'Personaliza la aplicación para verla, leerla y navegarla con mayor comodidad.',
		'Customize the application for more comfortable viewing, reading, and navigation.',
		'Personnalisez l’application pour la consulter, la lire et la parcourir plus confortablement.',
	],
	[
		'Idioma de la aplicación',
		'Application language',
		'Langue de l’application',
	],
	['Idioma', 'Language', 'Langue'],
	['Español', 'Spanish', 'Espagnol'],
	['Inglés', 'English', 'Anglais'],
	['Francés', 'French', 'Français'],
	['Modo de accesibilidad', 'Accessibility mode', 'Mode d’accessibilité'],
	['Texto', 'Text', 'Texte'],
	['Normal', 'Default', 'Normal'],
	['Grande', 'Large', 'Grand'],
	['Muy grande', 'Extra large', 'Très grand'],
	['Alto contraste', 'High contrast', 'Contraste élevé'],
	[
		'Refuerza la separación entre texto, fondos y controles.',
		'Strengthens separation between text, backgrounds, and controls.',
		'Renforce la séparation entre le texte, les arrière-plans et les commandes.',
	],
	['Reducir movimiento', 'Reduce motion', 'Réduire les animations'],
	[
		'Desactiva animaciones y desplazamientos no esenciales.',
		'Disables non-essential animations and movement.',
		'Désactive les animations et mouvements non essentiels.',
	],
	['Enfoque visible', 'Visible focus', 'Focus visible'],
	[
		'Resalta claramente el elemento seleccionado con teclado.',
		'Clearly highlights the element selected with the keyboard.',
		'Met clairement en évidence l’élément sélectionné au clavier.',
	],
	['Fuente legible', 'Readable font', 'Police lisible'],
	[
		'Usa una tipografía optimizada para lectura continua.',
		'Uses a typeface optimized for continuous reading.',
		'Utilise une police optimisée pour la lecture continue.',
	],
	['Espaciado cómodo', 'Comfortable spacing', 'Espacement confortable'],
	[
		'Aumenta el espacio entre líneas y caracteres.',
		'Increases spacing between lines and characters.',
		'Augmente l’espace entre les lignes et les caractères.',
	],
	[
		'Restablecer preferencias',
		'Reset preferences',
		'Réinitialiser les préférences',
	],
	[
		'Preferencias restablecidas',
		'Preferences reset',
		'Préférences réinitialisées',
	],
	['Preferencias guardadas', 'Preferences saved', 'Préférences enregistrées'],
	[
		'Saltar al contenido principal',
		'Skip to main content',
		'Aller au contenu principal',
	],

	['Inicio', 'Home', 'Accueil'],
	['General', 'General', 'Général'],
	['Planificación', 'Planning', 'Planification'],
	['Ministerios', 'Ministries', 'Ministères'],
	['Administración', 'Administration', 'Administration'],
	['Calendario', 'Calendar', 'Calendrier'],
	['Nueva actividad', 'New activity', 'Nouvelle activité'],
	['Crear', 'Create', 'Créer'],
	['Revisión', 'Review', 'Révision'],
	['Reportes', 'Reports', 'Rapports'],
	['Alertas', 'Alerts', 'Alertes'],
	['Notificaciones', 'Notifications', 'Notifications'],
	['Ancianos', 'Elders', 'Anciens'],
	['Documentos', 'Documents', 'Documents'],
	['Nombramientos', 'Nominations', 'Nominations'],
	['Departamentos', 'Departments', 'Départements'],
	['Equipo', 'Team', 'Équipe'],
	['Formulario', 'Form', 'Formulaire'],
	['Configuración', 'Settings', 'Paramètres'],
	['Menú principal', 'Main menu', 'Menu principal'],
	['Navegación principal', 'Main navigation', 'Navigation principale'],
	['Navegación móvil', 'Mobile navigation', 'Navigation mobile'],
	['Abrir menú', 'Open menu', 'Ouvrir le menu'],
	['Cerrar menú', 'Close menu', 'Fermer le menu'],
	['Cerrar navegación', 'Close navigation', 'Fermer la navigation'],
	['Contraer menú lateral', 'Collapse sidebar', 'Réduire la barre latérale'],
	['Expandir menú lateral', 'Expand sidebar', 'Développer la barre latérale'],
	['Contraer menú', 'Collapse menu', 'Réduire le menu'],
	['Expandir menú', 'Expand menu', 'Développer le menu'],
	['Cerrar sesión', 'Sign out', 'Se déconnecter'],
	['Cargando…', 'Loading…', 'Chargement…'],
	['Cargando', 'Loading', 'Chargement'],

	['Bienvenido', 'Welcome', 'Bienvenue'],
	[
		'Ingresa a tu iglesia',
		'Sign in to your church',
		'Connectez-vous à votre église',
	],
	[
		'Usa tus credenciales de GestionChurch.',
		'Use your GestionChurch credentials.',
		'Utilisez vos identifiants GestionChurch.',
	],
	['Iglesia o código', 'Church or code', 'Église ou code'],
	['Usuario', 'Username', 'Utilisateur'],
	['Contraseña', 'Password', 'Mot de passe'],
	['Mostrar contraseña', 'Show password', 'Afficher le mot de passe'],
	['Ocultar contraseña', 'Hide password', 'Masquer le mot de passe'],
	[
		'¿Olvidaste tu contraseña?',
		'Forgot your password?',
		'Mot de passe oublié ?',
	],
	['Ingresar', 'Sign in', 'Se connecter'],
	[
		'Sesión cifrada y protegida',
		'Encrypted and protected session',
		'Session chiffrée et protégée',
	],
	[
		'UNA IGLESIA · UN CALENDARIO',
		'ONE CHURCH · ONE CALENDAR',
		'UNE ÉGLISE · UN CALENDRIER',
	],
	['Más coordinación.', 'Better coordination.', 'Plus de coordination.'],
	['Más espacio para la', 'More room for the', 'Plus d’espace pour la'],
	['misión.', 'mission.', 'mission.'],
	[
		'Planifica las actividades de todos los departamentos, anticipa los conflictos y toma decisiones con claridad.',
		'Plan every department’s activities, anticipate conflicts, and make clear decisions.',
		'Planifiez les activités de chaque département, anticipez les conflits et prenez des décisions claires.',
	],
	[
		'Datos aislados por iglesia',
		'Data isolated by church',
		'Données isolées par église',
	],
	[
		'Cada tenant maneja su propia base de datos.',
		'Each tenant manages its own database.',
		'Chaque tenant gère sa propre base de données.',
	],
	[
		'“Pero hágase todo decentemente y con orden.” · 1 Corintios 14:40',
		'“But everything should be done in a fitting and orderly way.” · 1 Corinthians 14:40',
		'« Mais que tout se fasse avec bienséance et avec ordre. » · 1 Corinthiens 14:40',
	],
	[
		'Correo, contraseña o iglesia incorrectos.',
		'Incorrect username, password, or church.',
		'Utilisateur, mot de passe ou église incorrect.',
	],
	[
		'No fue posible iniciar sesión.',
		'Unable to sign in.',
		'Impossible de se connecter.',
	],
	['Recuperación segura', 'Secure recovery', 'Récupération sécurisée'],
	[
		'Restablece tu contraseña',
		'Reset your password',
		'Réinitialisez votre mot de passe',
	],
	[
		'Enviaremos un enlace de un solo uso con vigencia de 30 minutos.',
		'We will send a one-time link valid for 30 minutes.',
		'Nous enverrons un lien à usage unique valable 30 minutes.',
	],
	['Correo electrónico', 'Email address', 'Adresse e-mail'],
	['Enviar enlace seguro', 'Send secure link', 'Envoyer le lien sécurisé'],
	['Solicitud recibida', 'Request received', 'Demande reçue'],
	['Volver al inicio de sesión', 'Back to sign in', 'Retour à la connexion'],
	['Nueva contraseña', 'New password', 'Nouveau mot de passe'],
	['Confirmar contraseña', 'Confirm password', 'Confirmer le mot de passe'],
	[
		'Mínimo 12 caracteres.',
		'At least 12 characters.',
		'12 caractères minimum.',
	],
	['Guardar contraseña', 'Save password', 'Enregistrer le mot de passe'],
	['Contraseña actualizada', 'Password updated', 'Mot de passe mis à jour'],
	[
		'Todas tus sesiones anteriores fueron cerradas.',
		'All your previous sessions have been closed.',
		'Toutes vos sessions précédentes ont été fermées.',
	],
	[
		'Las contraseñas no coinciden.',
		'Passwords do not match.',
		'Les mots de passe ne correspondent pas.',
	],

	['Guardar', 'Save', 'Enregistrer'],
	['Guardando…', 'Saving…', 'Enregistrement…'],
	['Cancelar', 'Cancel', 'Annuler'],
	['Cerrar', 'Close', 'Fermer'],
	['Volver', 'Back', 'Retour'],
	['Agregar', 'Add', 'Ajouter'],
	['Editar', 'Edit', 'Modifier'],
	['Eliminar', 'Delete', 'Supprimer'],
	['Descargar', 'Download', 'Télécharger'],
	['Visualizar', 'View', 'Visualiser'],
	['Buscar', 'Search', 'Rechercher'],
	['Seleccionar…', 'Select…', 'Sélectionner…'],
	['Confirmar', 'Confirm', 'Confirmer'],
	['Reintentar', 'Retry', 'Réessayer'],
	['Copiar', 'Copy', 'Copier'],
	['Sí', 'Yes', 'Oui'],
	['No', 'No', 'Non'],
	['Todos', 'All', 'Tous'],
	['Todas', 'All', 'Toutes'],
	['Estado', 'Status', 'Statut'],
	['Nombre', 'Name', 'Nom'],
	['Descripción', 'Description', 'Description'],
	['Objetivo', 'Objective', 'Objectif'],
	['Departamento', 'Department', 'Département'],
	['Responsable', 'Person responsible', 'Responsable'],
	['Lugar', 'Location', 'Lieu'],
	['Fecha', 'Date', 'Date'],
	['Fecha y horario', 'Date and time', 'Date et heure'],
	['Desde', 'From', 'Du'],
	['Hasta', 'Until', 'Jusqu’au'],
	['Tipo', 'Type', 'Type'],
	['Título', 'Title', 'Titre'],
	['Categoría', 'Category', 'Catégorie'],
	['Audiencia', 'Audience', 'Public'],
	['Visibilidad', 'Visibility', 'Visibilité'],
	[
		'Información adicional',
		'Additional information',
		'Informations complémentaires',
	],
	['Atención', 'Attention', 'Attention'],
	['Listo', 'Ready', 'Prêt'],
	['Disponible', 'Available', 'Disponible'],
	['Sin fecha', 'No date', 'Sans date'],
	['sin fecha', 'no date', 'sans date'],
	['Por definir', 'To be defined', 'À définir'],
	['Por asignar', 'Unassigned', 'Non attribué'],
	['Por confirmar', 'To be confirmed', 'À confirmer'],
	['Sin estimar', 'Not estimated', 'Non estimé'],
	[
		'Sin descripción adicional.',
		'No additional description.',
		'Aucune description supplémentaire.',
	],
	['No encontramos coincidencias', 'No matches found', 'Aucun résultat trouvé'],

	['Borrador', 'Draft', 'Brouillon'],
	['Por aprobar', 'Pending approval', 'En attente d’approbation'],
	['En revisión', 'Under review', 'En révision'],
	['Requiere cambios', 'Changes required', 'Modifications requises'],
	['Aprobada', 'Approved', 'Approuvée'],
	['Rechazada', 'Rejected', 'Rejetée'],
	['Cancelada', 'Cancelled', 'Annulée'],
	['Completada', 'Completed', 'Terminée'],
	['Pendiente', 'Pending', 'En attente'],
	['Crítico', 'Critical', 'Critique'],
	['Alto', 'High', 'Élevé'],
	['Aviso', 'Warning', 'Avertissement'],
	['Publicado', 'Published', 'Publié'],
	['Visible', 'Visible', 'Visible'],
	['Real', 'Live', 'Réel'],
	['Simulado', 'Simulated', 'Simulé'],

	['Centro de control', 'Control center', 'Centre de contrôle'],
	[
		'Inteligencia operativa',
		'Operational intelligence',
		'Intelligence opérationnelle',
	],
	[
		'Lo que requiere atención',
		'What needs attention',
		'Ce qui nécessite une attention',
	],
	['Atención requerida', 'Attention required', 'Attention requise'],
	['Próximas actividades', 'Upcoming activities', 'Activités à venir'],
	['Agenda ejecutiva', 'Executive agenda', 'Agenda exécutif'],
	['Por departamento', 'By department', 'Par département'],
	['Carga ministerial', 'Ministry workload', 'Charge ministérielle'],
	[
		'Últimas tres actividades',
		'Last three activities',
		'Trois dernières activités',
	],
	['Base del pronóstico', 'Forecast basis', 'Base de la prévision'],
	['Pronóstico operativo', 'Operational forecast', 'Prévision opérationnelle'],
	[
		'Planificación vs. cierre',
		'Planning vs. completion',
		'Planification et clôture',
	],
	['Pulso semestral', 'Six-month pulse', 'Tendance semestrielle'],
	['Actividades planificadas', 'Planned activities', 'Activités planifiées'],
	['Actividades completadas', 'Completed activities', 'Activités terminées'],
	['Actividades vencidas', 'Overdue activities', 'Activités en retard'],
	[
		'Actividades sin completar',
		'Incomplete activities',
		'Activités incomplètes',
	],
	['Actividades aprobadas', 'Approved activities', 'Activités approuvées'],
	[
		'Actividades que requieren atención',
		'Activities requiring attention',
		'Activités nécessitant une attention',
	],
	[
		'Actividades de los próximos 7 días',
		'Activities in the next 7 days',
		'Activités des 7 prochains jours',
	],
	['Ver calendario', 'View calendar', 'Voir le calendrier'],
	['Gestionar', 'Manage', 'Gérer'],
	[
		'Aún no hay actividades próximas',
		'No upcoming activities yet',
		'Aucune activité à venir',
	],
	[
		'Crea una actividad para comenzar a organizar el calendario.',
		'Create an activity to start organizing the calendar.',
		'Créez une activité pour commencer à organiser le calendrier.',
	],
	['Crear actividad', 'Create activity', 'Créer une activité'],

	['Agenda de actividades', 'Activity schedule', 'Agenda des activités'],
	['Mes anterior', 'Previous month', 'Mois précédent'],
	['Mes siguiente', 'Next month', 'Mois suivant'],
	['Hoy', 'Today', 'Aujourd’hui'],
	['Mes', 'Month', 'Mois'],
	['Agenda', 'Agenda', 'Agenda'],
	[
		'Buscar en el calendario',
		'Search calendar',
		'Rechercher dans le calendrier',
	],
	[
		'Buscar actividad, junta, departamento o lugar…',
		'Search activity, meeting, department, or location…',
		'Rechercher une activité, une réunion, un département ou un lieu…',
	],
	[
		'Busca por actividad, junta, departamento o lugar.',
		'Search by activity, meeting, department, or location.',
		'Recherchez par activité, réunion, département ou lieu.',
	],
	[
		'Consultando actividades…',
		'Loading activities…',
		'Chargement des activités…',
	],
	[
		'No hay actividades para esta vista',
		'No activities in this view',
		'Aucune activité dans cette vue',
	],
	[
		'Información de la actividad',
		'Activity information',
		'Informations sur l’activité',
	],
	['Nombre de la actividad', 'Activity name', 'Nom de l’activité'],
	['Fechas propuestas', 'Proposed dates', 'Dates proposées'],
	['Fecha preferida', 'Preferred date', 'Date préférée'],
	['Agregar otra fecha', 'Add another date', 'Ajouter une autre date'],
	[
		'Comprobar disponibilidad',
		'Check availability',
		'Vérifier la disponibilité',
	],
	['Horario disponible', 'Time slot available', 'Créneau disponible'],
	[
		'La fecha ya está ocupada',
		'The date is already booked',
		'La date est déjà réservée',
	],
	[
		'Enviar para aprobación',
		'Submit for approval',
		'Soumettre pour approbation',
	],
	['Guardar como borrador', 'Save as draft', 'Enregistrer comme brouillon'],
	['Antes de enviar', 'Before submitting', 'Avant d’envoyer'],
	[
		'Confirma la zona horaria',
		'Confirm the time zone',
		'Confirmez le fuseau horaire',
	],
	[
		'Incluye montaje y desmontaje',
		'Include setup and teardown',
		'Incluez le montage et le démontage',
	],
	[
		'Agrega una alternativa si es posible',
		'Add an alternative if possible',
		'Ajoutez une alternative si possible',
	],
	['Programa de la actividad', 'Activity program', 'Programme de l’activité'],
	[
		'Adjunta Word, PDF, Excel, PowerPoint, CSV o imagen.',
		'Attach Word, PDF, Excel, PowerPoint, CSV, or an image.',
		'Joignez un document Word, PDF, Excel, PowerPoint, CSV ou une image.',
	],
	['Solicitud enviada', 'Request submitted', 'Demande envoyée'],

	['Junta de revisión', 'Review board', 'Comité de révision'],
	[
		'Decisiones y conflictos',
		'Decisions and conflicts',
		'Décisions et conflits',
	],
	['Sesiones de junta', 'Board sessions', 'Séances du comité'],
	['Pendientes de aprobación', 'Pending approval', 'En attente d’approbation'],
	[
		'Solicitudes de coexistencia',
		'Coexistence requests',
		'Demandes de coexistence',
	],
	[
		'Solicitudes de modificación',
		'Change requests',
		'Demandes de modification',
	],
	['Casos para revisar', 'Cases to review', 'Dossiers à examiner'],
	['Selecciona un caso', 'Select a case', 'Sélectionnez un dossier'],
	[
		'Crear sesión de junta',
		'Create board session',
		'Créer une séance du comité',
	],
	['Crear sesión', 'Create session', 'Créer une séance'],
	['Nombre de la sesión', 'Session name', 'Nom de la séance'],
	['Lugar o enlace', 'Location or link', 'Lieu ou lien'],
	['Participantes', 'Participants', 'Participants'],
	['Casos vinculados', 'Linked cases', 'Dossiers liés'],
	['Confirmar asistencia', 'Confirm attendance', 'Confirmer la présence'],
	[
		'¿Participarás en esta sesión?',
		'Will you attend this session?',
		'Participerez-vous à cette séance ?',
	],
	['Asistiré', 'I will attend', 'Je participerai'],
	['No podré asistir', 'I cannot attend', 'Je ne pourrai pas participer'],
	['Acta y acuerdos', 'Minutes and decisions', 'Procès-verbal et décisions'],
	[
		'Cerrar y guardar acta',
		'Close and save minutes',
		'Clôturer et enregistrer le procès-verbal',
	],
	['Aprobar', 'Approve', 'Approuver'],
	['Rechazar', 'Reject', 'Rejeter'],
	['Pedir cambios', 'Request changes', 'Demander des modifications'],
	['Posponer', 'Postpone', 'Reporter'],
	['Aprobar alternativa', 'Approve alternative', 'Approuver l’alternative'],
	[
		'Autorizar coexistencia',
		'Authorize coexistence',
		'Autoriser la coexistence',
	],
	['Alternativa disponible', 'Available alternative', 'Alternative disponible'],
	['Nueva alternativa', 'New alternative', 'Nouvelle alternative'],
	['Crear alternativa', 'Create alternative', 'Créer une alternative'],
	['Nombre de la alternativa', 'Alternative name', 'Nom de l’alternative'],
	['Guardar alternativa', 'Save alternative', 'Enregistrer l’alternative'],
	[
		'Horarios libres recomendados',
		'Recommended available times',
		'Créneaux disponibles recommandés',
	],
	[
		'La agenda de la junta está libre',
		'The board agenda is clear',
		'L’agenda du comité est libre',
	],
	[
		'Programar primera junta',
		'Schedule first meeting',
		'Planifier la première réunion',
	],

	['Centro de alertas', 'Alert center', 'Centre d’alertes'],
	['Canales y recordatorios', 'Channels and reminders', 'Canaux et rappels'],
	[
		'Las alertas críticas permanecen en la aplicación. WhatsApp requiere consentimiento explícito.',
		'Critical alerts remain in the application. WhatsApp requires explicit consent.',
		'Les alertes critiques restent dans l’application. WhatsApp exige un consentement explicite.',
	],
	['Correo', 'Email', 'E-mail'],
	['Recordatorios', 'Reminders', 'Rappels'],
	[
		'Actualizaciones opcionales',
		'Optional updates',
		'Mises à jour facultatives',
	],
	['Bandeja inteligente', 'Smart inbox', 'Boîte de réception intelligente'],
	['Historial de alertas', 'Alert history', 'Historique des alertes'],
	[
		'Buscar notificaciones',
		'Search notifications',
		'Rechercher des notifications',
	],
	[
		'Buscar alerta, actividad o canal…',
		'Search alert, activity, or channel…',
		'Rechercher une alerte, une activité ou un canal…',
	],
	['No leídas', 'Unread', 'Non lues'],
	['Leídas', 'Read', 'Lues'],
	['Todo está al día', 'Everything is up to date', 'Tout est à jour'],
	[
		'Las alertas del calendario aparecerán aquí.',
		'Calendar alerts will appear here.',
		'Les alertes du calendrier apparaîtront ici.',
	],
	[
		'No hay alertas que coincidan',
		'No matching alerts',
		'Aucune alerte correspondante',
	],
	[
		'Ajusta la búsqueda o el filtro de lectura.',
		'Adjust the search or read filter.',
		'Ajustez la recherche ou le filtre de lecture.',
	],
	['En app', 'In app', 'Dans l’application'],
	['Marcar como leída', 'Mark as read', 'Marquer comme lue'],
	[
		'Entregas que requieren atención',
		'Deliveries requiring attention',
		'Livraisons nécessitant une attention',
	],

	['Equipo y permisos', 'Team and permissions', 'Équipe et autorisations'],
	[
		'Personas, departamentos y permisos en un solo lugar',
		'People, departments, and permissions in one place',
		'Personnes, départements et autorisations en un seul endroit',
	],
	[
		'Agrega personas y enlázalas con sus departamentos.',
		'Add people and link them to their departments.',
		'Ajoutez des personnes et associez-les à leurs départements.',
	],
	['Agregar usuario', 'Add user', 'Ajouter un utilisateur'],
	['Nuevo usuario', 'New user', 'Nouvel utilisateur'],
	['Nombre completo', 'Full name', 'Nom complet'],
	['Contraseña temporal', 'Temporary password', 'Mot de passe temporaire'],
	['Tipo de cuenta', 'Account type', 'Type de compte'],
	['Rol', 'Role', 'Rôle'],
	[
		'Agregar otro departamento',
		'Add another department',
		'Ajouter un autre département',
	],
	[
		'Crear usuario conectado',
		'Create connected user',
		'Créer un utilisateur connecté',
	],
	['Creando y enlazando…', 'Creating and linking…', 'Création et association…'],
	['Buscar usuarios', 'Search users', 'Rechercher des utilisateurs'],
	[
		'Nombre, correo, rol o departamento…',
		'Name, email, role, or department…',
		'Nom, e-mail, rôle ou département…',
	],
	['No encontramos usuarios', 'No users found', 'Aucun utilisateur trouvé'],
	[
		'Prueba con otro nombre, correo, rol o departamento.',
		'Try another name, email, role, or department.',
		'Essayez un autre nom, e-mail, rôle ou département.',
	],
	[
		'Administrador del tenant',
		'Tenant administrator',
		'Administrateur du tenant',
	],
	['Secretaría de junta', 'Board secretary', 'Secrétariat du comité'],
	['Primer anciano', 'First elder', 'Premier ancien'],
	['Pastor', 'Pastor', 'Pasteur'],
	['Director/a', 'Director', 'Directeur/Directrice'],
	['Subdirector/a', 'Assistant director', 'Directeur/Directrice adjoint(e)'],
	['Planificador/a', 'Planner', 'Planificateur/Planificatrice'],
	['Consulta', 'Viewer', 'Consultation'],

	['Gobierno del tenant', 'Tenant governance', 'Gouvernance du tenant'],
	['Nuevo departamento', 'New department', 'Nouveau département'],
	['Crear departamento', 'Create department', 'Créer un département'],
	['Nombre del departamento', 'Department name', 'Nom du département'],
	[
		'Color de identificación',
		'Identification color',
		'Couleur d’identification',
	],
	[
		'Propósito y alcance del departamento…',
		'Department purpose and scope…',
		'Objet et portée du département…',
	],
	['Directorio', 'Directory', 'Répertoire'],
	['Departamento activo', 'Active department', 'Département actif'],
	['Equipo departamental', 'Department team', 'Équipe du département'],
	['Agregar integrante', 'Add member', 'Ajouter un membre'],
	[
		'Selecciona un departamento',
		'Select a department',
		'Sélectionnez un département',
	],
	[
		'Este departamento aún no tiene equipo',
		'This department does not have a team yet',
		'Ce département n’a pas encore d’équipe',
	],
	['Permisos en vivo', 'Live permissions', 'Autorisations en temps réel'],
	[
		'Protección de actividades aprobadas',
		'Protection of approved activities',
		'Protection des activités approuvées',
	],

	[
		'Centro de comunicaciones',
		'Communications center',
		'Centre de communications',
	],
	[
		'Canales confiables, bajo el control de tu iglesia.',
		'Reliable channels under your church’s control.',
		'Des canaux fiables sous le contrôle de votre église.',
	],
	['Correo transaccional', 'Transactional email', 'E-mail transactionnel'],
	['WhatsApp Cloud API', 'WhatsApp Cloud API', 'API WhatsApp Cloud'],
	['Configuración actualizada', 'Settings updated', 'Paramètres mis à jour'],
	['Guardar cambios', 'Save changes', 'Enregistrer les modifications'],
	['Prueba de entrega', 'Delivery test', 'Test de livraison'],
	['Ejecutar prueba', 'Run test', 'Exécuter le test'],

	['Diseñador de formulario', 'Form builder', 'Concepteur de formulaire'],
	[
		'Vista previa antes de publicar',
		'Preview before publishing',
		'Aperçu avant publication',
	],
	['Revisar vista previa', 'Review preview', 'Examiner l’aperçu'],
	['Publicar', 'Publish', 'Publier'],
	['Guardar borrador', 'Save draft', 'Enregistrer le brouillon'],
	['Título del formulario', 'Form title', 'Titre du formulaire'],
	[
		'Descripción del formulario',
		'Form description',
		'Description du formulaire',
	],
	['Texto del botón final', 'Final button text', 'Texte du bouton final'],
	['Nuevo campo', 'New field', 'Nouveau champ'],
	['Propiedades', 'Properties', 'Propriétés'],
	['Vista móvil', 'Mobile preview', 'Aperçu mobile'],
	['Vista de escritorio', 'Desktop preview', 'Aperçu bureau'],

	['Reporte ejecutivo', 'Executive report', 'Rapport exécutif'],
	['Centro de inteligencia', 'Intelligence center', 'Centre d’intelligence'],
	['Generar reporte', 'Generate report', 'Générer le rapport'],
	['Filtros ejecutivos', 'Executive filters', 'Filtres exécutifs'],
	['Año actual', 'Current year', 'Année en cours'],
	['30 días', '30 days', '30 jours'],
	['90 días', '90 days', '90 jours'],
	['Actividades incluidas', 'Included activities', 'Activités incluses'],
	['Índice de coordinación', 'Coordination index', 'Indice de coordination'],
	['Cumplimiento', 'Completion', 'Réalisation'],
	['Incidencia de conflictos', 'Conflict rate', 'Taux de conflits'],
	['Asistencia proyectada', 'Projected attendance', 'Présence prévue'],
	[
		'Desempeño por departamento',
		'Performance by department',
		'Performance par département',
	],
	['Evolución temporal', 'Trend over time', 'Évolution dans le temps'],
	['Hallazgos accionables', 'Actionable insights', 'Constats exploitables'],
	['Actividad', 'Activity', 'Activité'],
	['Resultado', 'Outcome', 'Résultat'],
	['Riesgo', 'Risk', 'Risque'],
	['Asistencia', 'Attendance', 'Présence'],

	[
		'Coordinación de Ancianos',
		'Elders coordination',
		'Coordination des anciens',
	],
	[
		'Una agenda clara para cuidar cada culto.',
		'A clear schedule to support every service.',
		'Un agenda clair pour accompagner chaque culte.',
	],
	['Turnos anuales', 'Annual rotations', 'Tours annuels'],
	[
		'Cobertura departamental',
		'Department coverage',
		'Couverture départementale',
	],
	[
		'Programas y documentos',
		'Programs and documents',
		'Programmes et documents',
	],
	[
		'Crear calendario de ancianos',
		'Create elders calendar',
		'Créer le calendrier des anciens',
	],
	['Asignar cobertura', 'Assign coverage', 'Attribuer la couverture'],
	['Nuevo programa', 'New program', 'Nouveau programme'],
	['Anciano responsable', 'Elder in charge', 'Ancien responsable'],
	['Predicador', 'Preacher', 'Prédicateur'],
	[
		'Cantante / artista invitado',
		'Singer / guest artist',
		'Chanteur / artiste invité',
	],
	['Himno', 'Hymn', 'Cantique'],
	['Lectura bíblica', 'Bible reading', 'Lecture biblique'],
	['Foto del predicador', 'Preacher photo', 'Photo du prédicateur'],
	['Foto del artista', 'Artist photo', 'Photo de l’artiste'],
	['Guardar programa', 'Save program', 'Enregistrer le programme'],
	[
		'Publicar para Publicidad y Adoración',
		'Publish for Communications and Worship',
		'Publier pour Communication et Adoration',
	],

	['Biblioteca ministerial', 'Ministry library', 'Bibliothèque ministérielle'],
	[
		'Documentos departamentales',
		'Department documents',
		'Documents départementaux',
	],
	['Cargar documento', 'Upload document', 'Téléverser un document'],
	['Buscar documentos', 'Search documents', 'Rechercher des documents'],
	[
		'Buscar título, archivo, referencia…',
		'Search title, file, reference…',
		'Rechercher un titre, un fichier, une référence…',
	],
	['Todos los departamentos', 'All departments', 'Tous les départements'],
	['Todos los tipos', 'All types', 'Tous les types'],
	[
		'Toda alineación',
		'All alignment statuses',
		'Tous les statuts d’alignement',
	],
	['Vista previa', 'Preview', 'Aperçu'],
	['Validar alineación', 'Validate alignment', 'Valider l’alignement'],
	['Alineación verificada', 'Alignment verified', 'Alignement vérifié'],

	['Acceso no disponible', 'Access unavailable', 'Accès indisponible'],
	[
		'Abriendo el módulo seguro…',
		'Opening secure module…',
		'Ouverture du module sécurisé…',
	],
	['Volver a tenants', 'Back to tenants', 'Retour aux tenants'],
	['Administración global', 'Global administration', 'Administration globale'],
	['Iglesias y tenants', 'Churches and tenants', 'Églises et tenants'],
	['Nueva iglesia', 'New church', 'Nouvelle église'],
	[
		'Provisionar nueva iglesia',
		'Provision new church',
		'Provisionner une nouvelle église',
	],
	['Nombre de la iglesia', 'Church name', 'Nom de l’église'],
	['Subdominio', 'Subdomain', 'Sous-domaine'],
	['Zona horaria', 'Time zone', 'Fuseau horaire'],
	['Nombre del administrador', 'Administrator name', 'Nom de l’administrateur'],
	[
		'Correo del administrador',
		'Administrator email',
		'E-mail de l’administrateur',
	],
	['Provisionar', 'Provision', 'Provisionner'],
	[
		'Base independiente',
		'Independent database',
		'Base de données indépendante',
	],
];

const supplementalEntries: Translation[] = [
	[
		'Administración del tenant',
		'Tenant administration',
		'Administration du tenant',
	],
	['Accesos del tenant', 'Tenant access', 'Accès du tenant'],
	[
		'Administra usuarios, departamentos y configuración.',
		'Manage users, departments, and settings.',
		'Gérez les utilisateurs, les départements et les paramètres.',
	],
	['Centro de alertas', 'Alert center', 'Centre d’alertes'],
	[
		'Planificación congregacional',
		'Congregational planning',
		'Planification de l’église',
	],
	[
		'Inteligencia operativa',
		'Operational intelligence',
		'Intelligence opérationnelle',
	],
	[
		'Inteligencia y rendimiento',
		'Intelligence and performance',
		'Intelligence et performance',
	],
	['Gobierno de iglesia', 'Church governance', 'Gouvernance de l’église'],
	[
		'Coordinación espiritual',
		'Spiritual coordination',
		'Coordination spirituelle',
	],
	[
		'Programas y documentos',
		'Programs and documents',
		'Programmes et documents',
	],
	['Conocimiento conectado', 'Connected knowledge', 'Connaissances connectées'],
	['Equipo y permisos', 'Team and permissions', 'Équipe et autorisations'],
	['Agregar usuario', 'Add user', 'Ajouter un utilisateur'],
	['Agregar al equipo', 'Add to team', 'Ajouter à l’équipe'],
	['Nuevo departamento', 'New department', 'Nouveau département'],
	[
		'Nueva unidad ministerial',
		'New ministry unit',
		'Nouvelle unité ministérielle',
	],
	['Buscar departamentos', 'Search departments', 'Rechercher des départements'],
	[
		'Buscar integrante, correo o rol…',
		'Search member, email, or role…',
		'Rechercher un membre, un e-mail ou un rôle…',
	],
	[
		'Buscar usuario o departamento…',
		'Search user or department…',
		'Rechercher un utilisateur ou un département…',
	],
	[
		'Buscar en el calendario',
		'Search the calendar',
		'Rechercher dans le calendrier',
	],
	[
		'Buscar actividad, junta, departamento o lugar…',
		'Search activity, meeting, department, or location…',
		'Rechercher une activité, une réunion, un département ou un lieu…',
	],
	[
		'Limpiar búsqueda del calendario',
		'Clear calendar search',
		'Effacer la recherche du calendrier',
	],
	['Mes anterior', 'Previous month', 'Mois précédent'],
	['Mes siguiente', 'Next month', 'Mois suivant'],
	['Mes', 'Month', 'Mois'],
	['Agenda', 'Agenda', 'Agenda'],
	['Vista filtrada', 'Filtered view', 'Vue filtrée'],
	['Limpiar filtro', 'Clear filter', 'Effacer le filtre'],
	['No encontramos coincidencias', 'No matches found', 'Aucun résultat trouvé'],
	[
		'Busca por actividad, junta, departamento o lugar.',
		'Search by activity, meeting, department, or location.',
		'Recherchez par activité, réunion, département ou lieu.',
	],
	[
		'No hay actividades para esta vista',
		'No activities for this view',
		'Aucune activité pour cette vue',
	],
	[
		'Prueba otro periodo o limpia el filtro aplicado.',
		'Try another period or clear the applied filter.',
		'Essayez une autre période ou effacez le filtre appliqué.',
	],
	['Agenda de actividades', 'Activity agenda', 'Agenda des activités'],
	['sin fecha', 'no date', 'sans date'],
	['más', 'more', 'de plus'],
	['actividad visible', 'visible activity', 'activité visible'],
	['actividades visibles', 'visible activities', 'activités visibles'],
	[
		'Consultando actividades…',
		'Loading activities…',
		'Chargement des activités…',
	],
	['Centro de control', 'Control center', 'Centre de contrôle'],
	['Atención requerida', 'Attention required', 'Attention requise'],
	['Coordinación activa', 'Active coordination', 'Coordination active'],
	[
		'La agenda avanza; hay decisiones pendientes.',
		'The agenda is moving forward; decisions are pending.',
		'L’agenda progresse; des décisions sont en attente.',
	],
	[
		'Prioriza vencimientos y conflictos para recuperar el ritmo operativo.',
		'Prioritize overdue items and conflicts to restore operational momentum.',
		'Priorisez les retards et les conflits pour rétablir le rythme opérationnel.',
	],
	[
		'Revisa aprobaciones y mantén la planificación en movimiento.',
		'Review approvals and keep planning moving.',
		'Examinez les approbations et maintenez la planification en mouvement.',
	],
	['Todo en orden', 'Everything on track', 'Tout est en ordre'],
	[
		'El calendario y los equipos mantienen una operación saludable.',
		'The calendar and teams are maintaining a healthy operation.',
		'Le calendrier et les équipes maintiennent un fonctionnement sain.',
	],
	['Por asignar', 'Unassigned', 'À attribuer'],
	[
		'Crea la próxima cobertura semanal',
		'Create the next weekly coverage',
		'Créez la prochaine couverture hebdomadaire',
	],
	[
		'Predicador por confirmar',
		'Preacher to be confirmed',
		'Prédicateur à confirmer',
	],
	['Himno por confirmar', 'Hymn to be confirmed', 'Cantique à confirmer'],
	[
		'Los próximos programas aparecerán aquí.',
		'Upcoming programs will appear here.',
		'Les prochains programmes apparaîtront ici.',
	],
	[
		'Aún no hay actividades próximas',
		'No upcoming activities yet',
		'Aucune activité à venir',
	],
	[
		'Crea una actividad para comenzar a organizar el calendario.',
		'Create an activity to start organizing the calendar.',
		'Créez une activité pour commencer à organiser le calendrier.',
	],
	['Crear actividad', 'Create activity', 'Créer une activité'],
	['Lugar por definir', 'Location to be defined', 'Lieu à définir'],
	['Vencida', 'Overdue', 'En retard'],
	['Conflicto', 'Conflict', 'Conflit'],
	['Cambios', 'Changes', 'Modifications'],
	['En espera', 'Waiting', 'En attente'],
	['Borrador antiguo', 'Stale draft', 'Brouillon ancien'],
	[
		'Finalizó y todavía no se ha confirmado como completada.',
		'It ended and has not yet been confirmed as completed.',
		'Elle est terminée mais n’a pas encore été confirmée comme achevée.',
	],
	[
		'Requiere una decisión de coordinación.',
		'Requires a coordination decision.',
		'Nécessite une décision de coordination.',
	],
	[
		'El departamento debe corregir y reenviar.',
		'The department must correct and resubmit.',
		'Le département doit corriger et renvoyer.',
	],
	[
		'Lleva más de 48 horas esperando aprobación.',
		'It has been waiting for approval for more than 48 hours.',
		'En attente d’approbation depuis plus de 48 heures.',
	],
	[
		'Lleva más de siete días sin enviarse.',
		'It has remained unsent for more than seven days.',
		'Il n’a pas été envoyé depuis plus de sept jours.',
	],
	['En curso', 'On track', 'En bonne voie'],
	['Vigilar', 'Watch', 'À surveiller'],
	['En riesgo', 'At risk', 'À risque'],
	[
		'Planificación vs. cierre',
		'Planning vs. completion',
		'Planification et clôture',
	],
	[
		'Últimas tres actividades',
		'Last three activities',
		'Trois dernières activités',
	],
	['Próximas actividades', 'Upcoming activities', 'Activités à venir'],
	['Por departamento', 'By department', 'Par département'],
	['Ver calendario', 'View calendar', 'Voir le calendrier'],
	['Actividades aprobadas', 'Approved activities', 'Activités approuvées'],
	['Pendientes de aprobación', 'Pending approval', 'En attente d’approbation'],
	['Conflictos abiertos', 'Open conflicts', 'Conflits ouverts'],
	['Borradores', 'Drafts', 'Brouillons'],
	['Completadas', 'Completed', 'Terminées'],
	['Vencidas', 'Overdue', 'En retard'],
	['Sin completar', 'Incomplete', 'Incomplètes'],
	[
		'requieren coordinación',
		'require coordination',
		'nécessitent une coordination',
	],
	['esperando decisión', 'awaiting decision', 'en attente de décision'],
	['en calendario', 'on calendar', 'au calendrier'],
	['sin enviar', 'not submitted', 'non soumis'],
	['Reportes ejecutivos', 'Executive reports', 'Rapports exécutifs'],
	['Reporte ejecutivo', 'Executive report', 'Rapport exécutif'],
	['Actualizar reporte', 'Refresh report', 'Actualiser le rapport'],
	['Descargar CSV', 'Download CSV', 'Télécharger le CSV'],
	['ALCANCE DEL REPORTE', 'REPORT SCOPE', 'PORTÉE DU RAPPORT'],
	[
		'Convierte la planificación, el cumplimiento y los conflictos en una lectura ejecutiva accionable para la iglesia.',
		'Turn planning, completion, and conflicts into actionable executive insight for the church.',
		'Transformez la planification, l’exécution et les conflits en informations décisionnelles exploitables pour l’église.',
	],
	['Índice de coordinación', 'Coordination index', 'Indice de coordination'],
	['Operación saludable', 'Healthy operation', 'Fonctionnement sain'],
	['Seguimiento recomendado', 'Follow-up recommended', 'Suivi recommandé'],
	[
		'Intervención prioritaria',
		'Priority intervention',
		'Intervention prioritaire',
	],
	[
		'Volumen, cumplimiento y riesgos.',
		'Volume, completion, and risks.',
		'Volume, exécution et risques.',
	],
	[
		'Planificación y resultados',
		'Planning and results',
		'Planification et résultats',
	],
	[
		'Compara volumen, cierres y fricción por mes.',
		'Compare volume, completions, and friction by month.',
		'Comparez le volume, les clôtures et les frictions par mois.',
	],
	['Estado del portafolio', 'Portfolio status', 'État du portefeuille'],
	[
		'Ciclo de vida de las actividades.',
		'Activity lifecycle.',
		'Cycle de vie des activités.',
	],
	[
		'Rendimiento por departamento',
		'Performance by department',
		'Performance par département',
	],
	['Señales ejecutivas', 'Executive signals', 'Indicateurs exécutifs'],
	[
		'Señales calculadas con los datos del período.',
		'Signals calculated from period data.',
		'Indicateurs calculés à partir des données de la période.',
	],
	['Detalle operativo', 'Operational detail', 'Détail opérationnel'],
	[
		'Cada fila abre el expediente original para validar la información.',
		'Each row opens the original record to validate the information.',
		'Chaque ligne ouvre le dossier original pour valider les informations.',
	],
	['Buscar en el reporte', 'Search reports', 'Rechercher dans les rapports'],
	[
		'Código, actividad, departamento o responsable…',
		'Code, activity, department, or owner…',
		'Code, activité, département ou responsable…',
	],
	[
		'Limpiar búsqueda del reporte',
		'Clear report search',
		'Effacer la recherche du rapport',
	],
	['Todos los estados', 'All statuses', 'Tous les statuts'],
	[
		'Sin datos para este período',
		'No data for this period',
		'Aucune donnée pour cette période',
	],
	[
		'Amplía las fechas o selecciona otro alcance.',
		'Expand the dates or select another scope.',
		'Élargissez les dates ou sélectionnez une autre portée.',
	],
	['Sin coincidencias', 'No matches', 'Aucun résultat'],
	[
		'Prueba con otro código, actividad, departamento o responsable.',
		'Try another code, activity, department, or owner.',
		'Essayez un autre code, une autre activité, un autre département ou un autre responsable.',
	],
	[
		'Sin período comparable',
		'No comparable period',
		'Aucune période comparable',
	],
	['período anterior', 'previous period', 'période précédente'],
	['Asistencia proyectada', 'Projected attendance', 'Participation prévue'],
	['Anticipación media', 'Average lead time', 'Délai moyen'],
	[
		'Sin anticipación calculable',
		'Lead time unavailable',
		'Délai non calculable',
	],
	['Alto', 'High', 'Élevé'],
	['Saludable', 'Healthy', 'Sain'],
	['Asistencia', 'Attendance', 'Participation'],
	['Resultado', 'Outcome', 'Résultat'],
	['Riesgo', 'Risk', 'Risque'],
	['Fecha', 'Date', 'Date'],
	['Abrir', 'Open', 'Ouvrir'],
	['Junta de revisión', 'Review board', 'Comité de révision'],
	[
		'Decisiones y conflictos',
		'Decisions and conflicts',
		'Décisions et conflits',
	],
	['Sesiones de junta', 'Board sessions', 'Sessions du comité'],
	[
		'Solicitudes de modificación',
		'Change requests',
		'Demandes de modification',
	],
	[
		'Solicitudes de coexistencia',
		'Coexistence requests',
		'Demandes de coexistence',
	],
	['Sin conflictos', 'No conflicts', 'Sans conflits'],
	[
		'Buscar en la junta de revisión',
		'Search the review board',
		'Rechercher dans le comité de révision',
	],
	[
		'Buscar sesión, participante, lugar o caso…',
		'Search session, participant, location, or case…',
		'Rechercher une session, un participant, un lieu ou un dossier…',
	],
	[
		'Limpiar búsqueda de revisión',
		'Clear review search',
		'Effacer la recherche de révision',
	],
	['Todo bajo control', 'Everything under control', 'Tout est sous contrôle'],
	[
		'No hay modificaciones de actividades aprobadas esperando autorización.',
		'No approved-activity changes are awaiting authorization.',
		'Aucune modification d’activité approuvée n’attend d’autorisation.',
	],
	[
		'No hay aprobaciones pendientes',
		'No pending approvals',
		'Aucune approbation en attente',
	],
	[
		'Las actividades enviadas sin conflictos aparecerán aquí.',
		'Submitted activities without conflicts will appear here.',
		'Les activités soumises sans conflit apparaîtront ici.',
	],
	[
		'No hay conflictos pendientes',
		'No pending conflicts',
		'Aucun conflit en attente',
	],
	[
		'Las solicitudes de revisión aparecerán aquí.',
		'Review requests will appear here.',
		'Les demandes de révision apparaîtront ici.',
	],
	[
		'Conflicto que requiere resolución',
		'Conflict requiring resolution',
		'Conflit nécessitant une résolution',
	],
	[
		'Fecha y horario en disputa',
		'Disputed date and time',
		'Date et heure contestées',
	],
	[
		'Primera solicitud · tiene preferencia',
		'First request · has priority',
		'Première demande · prioritaire',
	],
	[
		'Solicitud posterior · debe revisarse',
		'Later request · requires review',
		'Demande ultérieure · à examiner',
	],
	['Presentó:', 'Submitted by:', 'Soumis par :'],
	[
		'Responsable por indicar',
		'Owner to be specified',
		'Responsable à préciser',
	],
	[
		'Superposición de horario congregacional',
		'Congregational schedule overlap',
		'Chevauchement d’horaire de l’église',
	],
	['Mismo responsable', 'Same owner', 'Même responsable'],
	[
		'Audiencia de alcance general',
		'Church-wide audience',
		'Public à portée générale',
	],
	['Plan de coexistencia', 'Coexistence plan', 'Plan de coexistence'],
	[
		'Nota oficial o recomendación',
		'Official note or recommendation',
		'Note officielle ou recommandation',
	],
	['Recomendación', 'Recommendation', 'Recommandation'],
	[
		'Guardar recomendación',
		'Save recommendation',
		'Enregistrer la recommandation',
	],
	['Alternativa disponible', 'Available alternative', 'Alternative disponible'],
	['Reconsiderar en', 'Reconsider on', 'Réexaminer le'],
	['Pedir cambios', 'Request changes', 'Demander des modifications'],
	['Posponer', 'Postpone', 'Reporter'],
	['Aprobar alternativa', 'Approve alternative', 'Approuver l’alternative'],
	[
		'Autorizar coexistencia',
		'Authorize coexistence',
		'Autoriser la coexistence',
	],
	['Seleccionar…', 'Select…', 'Sélectionner…'],
	['Horario pendiente', 'Time pending', 'Horaire en attente'],
	[
		'Horarios libres recomendados',
		'Recommended available times',
		'Créneaux disponibles recommandés',
	],
	[
		'Alternativas de calendario',
		'Calendar alternatives',
		'Alternatives de calendrier',
	],
	[
		'Aún no hay alternativas creadas',
		'No alternatives created yet',
		'Aucune alternative créée',
	],
	[
		'El administrador del tenant puede preparar opciones libres para esta decisión.',
		'The tenant administrator can prepare available options for this decision.',
		'L’administrateur du tenant peut préparer des options disponibles pour cette décision.',
	],
	[
		'Use horarios inteligentes o defina una opción manualmente.',
		'Use smart times or define an option manually.',
		'Utilisez des créneaux intelligents ou définissez une option manuellement.',
	],
	['Crear alternativa', 'Create alternative', 'Créer une alternative'],
	['Alternativa de la junta', 'Board alternative', 'Alternative du comité'],
	[
		'La agenda de la junta está libre',
		'The board agenda is clear',
		'L’agenda du comité est libre',
	],
	[
		'Cree una sesión, convoque usuarios y vincule los casos que serán revisados.',
		'Create a session, invite users, and link the cases to be reviewed.',
		'Créez une session, invitez des utilisateurs et liez les dossiers à examiner.',
	],
	[
		'Programar primera junta',
		'Schedule first board session',
		'Planifier la première session',
	],
	['No encontramos sesiones', 'No sessions found', 'Aucune session trouvée'],
	[
		'Prueba con otro título, participante, lugar o caso.',
		'Try another title, participant, location, or case.',
		'Essayez un autre titre, participant, lieu ou dossier.',
	],
	['Expediente de sesión', 'Session record', 'Dossier de session'],
	['Lugar por confirmar', 'Location to be confirmed', 'Lieu à confirmer'],
	['Cerrar seguimiento', 'Close follow-up', 'Fermer le suivi'],
	[
		'Lista para decisión de secretaría',
		'Ready for the secretary’s decision',
		'Prêt pour la décision du secrétariat',
	],
	[
		'El administrador prepara alternativas y recomendaciones; la aprobación final permanece segregada.',
		'The administrator prepares alternatives and recommendations; final approval remains segregated.',
		'L’administrateur prépare les alternatives et recommandations; l’approbation finale reste séparée.',
	],
	['Datos de acceso', 'Access credentials', 'Identifiants d’accès'],
	['Correo electrónico', 'Email address', 'Adresse e-mail'],
	['Contraseña', 'Password', 'Mot de passe'],
	[
		'¿Olvidaste tu contraseña?',
		'Forgot your password?',
		'Mot de passe oublié ?',
	],
	['Ingresar', 'Sign in', 'Se connecter'],
	[
		'Sesión cifrada y protegida',
		'Encrypted and protected session',
		'Session chiffrée et protégée',
	],
	[
		'Una iglesia · un calendario',
		'One church · one calendar',
		'Une église · un calendrier',
	],
	[
		'Más coordinación. Más espacio para la misión.',
		'More coordination. More space for the mission.',
		'Plus de coordination. Plus d’espace pour la mission.',
	],
	[
		'Planifica las actividades de todos los departamentos, anticipa los conflictos y toma decisiones con claridad.',
		'Plan every department’s activities, anticipate conflicts, and make clear decisions.',
		'Planifiez les activités de tous les départements, anticipez les conflits et prenez des décisions claires.',
	],
	[
		'Datos aislados por iglesia',
		'Data isolated by church',
		'Données isolées par église',
	],
	[
		'Cada tenant maneja su propia base de datos.',
		'Each tenant manages its own database.',
		'Chaque tenant gère sa propre base de données.',
	],
	['Recuperar contraseña', 'Recover password', 'Récupérer le mot de passe'],
	[
		'Escribe tu correo y te enviaremos instrucciones seguras.',
		'Enter your email and we will send secure instructions.',
		'Saisissez votre e-mail et nous vous enverrons des instructions sécurisées.',
	],
	['Enviar instrucciones', 'Send instructions', 'Envoyer les instructions'],
	['Volver al inicio de sesión', 'Back to sign in', 'Retour à la connexion'],
	[
		'Crea una contraseña segura',
		'Create a secure password',
		'Créez un mot de passe sécurisé',
	],
	['Nueva contraseña', 'New password', 'Nouveau mot de passe'],
	['Confirmar contraseña', 'Confirm password', 'Confirmer le mot de passe'],
	['Guardar contraseña', 'Save password', 'Enregistrer le mot de passe'],
	[
		'El enlace no es válido o ha vencido.',
		'The link is invalid or has expired.',
		'Le lien est invalide ou a expiré.',
	],
	['Equipo conectado', 'Connected team', 'Équipe connectée'],
	[
		'Cada cuenta queda conectada con su responsabilidad real dentro de la iglesia.',
		'Every account is connected to its actual responsibility within the church.',
		'Chaque compte est relié à sa responsabilité réelle au sein de l’église.',
	],
	['Usuarios activos', 'Active users', 'Utilisateurs actifs'],
	['Roles asignados', 'Assigned roles', 'Rôles attribués'],
	['Departamentos enlazados', 'Linked departments', 'Départements liés'],
	[
		'Buscar integrantes del departamento',
		'Search department members',
		'Rechercher des membres du département',
	],
	[
		'Limpiar búsqueda de integrantes',
		'Clear member search',
		'Effacer la recherche des membres',
	],
	[
		'Revisa el nombre, correo o rol buscado.',
		'Review the name, email, or role searched.',
		'Vérifiez le nom, l’e-mail ou le rôle recherché.',
	],
	['Identidad y acceso', 'Identity and access', 'Identité et accès'],
	[
		'Información personal y credenciales temporales.',
		'Personal information and temporary credentials.',
		'Informations personnelles et identifiants temporaires.',
	],
	['Nombre completo', 'Full name', 'Nom complet'],
	['Teléfono', 'Phone', 'Téléphone'],
	['Contraseña temporal', 'Temporary password', 'Mot de passe temporaire'],
	['Rol global', 'Global role', 'Rôle global'],
	[
		'Departamentos y responsabilidades',
		'Departments and responsibilities',
		'Départements et responsabilités',
	],
	[
		'Define su identidad, acceso general y el rol exacto que tendrá dentro de cada departamento.',
		'Define the person’s identity, general access, and exact role in each department.',
		'Définissez son identité, son accès général et son rôle exact dans chaque département.',
	],
	[
		'Selecciona al menos un departamento para el usuario departamental.',
		'Select at least one department for the departmental user.',
		'Sélectionnez au moins un département pour l’utilisateur départemental.',
	],
	[
		'Un departamento no puede asignarse dos veces al mismo usuario.',
		'A department cannot be assigned twice to the same user.',
		'Un département ne peut pas être attribué deux fois au même utilisateur.',
	],
	['Crear usuario', 'Create user', 'Créer l’utilisateur'],
	[
		'Usuario creado y enlazado correctamente con sus departamentos y permisos.',
		'User created and correctly linked to departments and permissions.',
		'Utilisateur créé et correctement lié à ses départements et autorisations.',
	],
	['Modelo de permisos', 'Permission model', 'Modèle d’autorisations'],
	[
		'Acceso de lectura sin responsabilidad departamental.',
		'Read-only access without departmental responsibility.',
		'Accès en lecture sans responsabilité départementale.',
	],
	[
		'Prepara borradores propios sin publicarlos.',
		'Prepares personal drafts without publishing them.',
		'Prépare ses propres brouillons sans les publier.',
	],
	[
		'Crea, edita y envía sus propias actividades.',
		'Creates, edits, and submits personal activities.',
		'Crée, modifie et soumet ses propres activités.',
	],
	[
		'Crea, edita y envía actividades del departamento.',
		'Creates, edits, and submits department activities.',
		'Crée, modifie et soumet les activités du département.',
	],
	[
		'Consulta calendario y participa en revisiones.',
		'Views the calendar and participates in reviews.',
		'Consulte le calendrier et participe aux révisions.',
	],
	[
		'Autoriza conflictos y cambios de actividades aprobadas.',
		'Authorizes conflicts and changes to approved activities.',
		'Autorise les conflits et les modifications d’activités approuvées.',
	],
	[
		'El acceso transversal dentro del tenant.',
		'Cross-functional access within the tenant.',
		'Accès transversal au sein du tenant.',
	],
	['Gobierno del tenant', 'Tenant governance', 'Gouvernance du tenant'],
	['Departamentos activos', 'Active departments', 'Départements actifs'],
	['membresías asignadas', 'assigned memberships', 'adhésions attribuées'],
	[
		'Actividades coordinadas',
		'Coordinated activities',
		'Activités coordonnées',
	],
	['Directorio', 'Directory', 'Répertoire'],
	['Dirección por asignar', 'Director unassigned', 'Direction à attribuer'],
	[
		'Sin descripción. Puedes incorporar al equipo y comenzar a planificar.',
		'No description. You can add the team and start planning.',
		'Aucune description. Vous pouvez intégrer l’équipe et commencer à planifier.',
	],
	['Departamento activo', 'Active department', 'Département actif'],
	['Integrante', 'Member', 'Membre'],
	[
		'Protección de actividades aprobadas',
		'Approved activity protection',
		'Protection des activités approuvées',
	],
	[
		'El director puede crear, publicar, modificar y cancelar antes de aprobación. Después, solo puede proponer cambios para autorización del administrador o secretario.',
		'The director can create, publish, edit, and cancel before approval. Afterwards, changes require administrator or secretary authorization.',
		'Le directeur peut créer, publier, modifier et annuler avant approbation. Ensuite, les modifications nécessitent l’autorisation de l’administrateur ou du secrétaire.',
	],
	['Equipo departamental', 'Department team', 'Équipe départementale'],
	['Permisos en vivo', 'Live permissions', 'Autorisations en direct'],
	[
		'Rol dentro del departamento',
		'Role within the department',
		'Rôle dans le département',
	],
	['Asignar integrante', 'Assign member', 'Attribuer un membre'],
	[
		'Crea su acceso o incorpora una persona existente y asigna su responsabilidad.',
		'Create access or add an existing person and assign responsibility.',
		'Créez son accès ou ajoutez une personne existante et attribuez sa responsabilité.',
	],
	[
		'Sus permisos se determinan por cada departamento.',
		'Permissions are determined per department.',
		'Les autorisations sont déterminées par département.',
	],
	[
		'La persona fue retirada del departamento.',
		'The person was removed from the department.',
		'La personne a été retirée du département.',
	],
	['Diseñador de formulario', 'Form designer', 'Concepteur de formulaire'],
	[
		'Diseña → guarda → revisa → publica',
		'Design → save → review → publish',
		'Concevoir → enregistrer → vérifier → publier',
	],
	[
		'Extiende el formulario según las necesidades de esta iglesia.',
		'Extend the form to fit this church’s needs.',
		'Adaptez le formulaire aux besoins de cette église.',
	],
	['Cambios sin guardar', 'Unsaved changes', 'Modifications non enregistrées'],
	[
		'Todos los cambios están guardados',
		'All changes are saved',
		'Toutes les modifications sont enregistrées',
	],
	['Guardar borrador', 'Save draft', 'Enregistrer le brouillon'],
	['Vista previa del formulario', 'Form preview', 'Aperçu du formulaire'],
	['Publicar formulario', 'Publish form', 'Publier le formulaire'],
	[
		'Flujo seguro de publicación',
		'Secure publishing workflow',
		'Flux de publication sécurisé',
	],
	[
		'Ningún cambio será público hasta completar la publicación.',
		'No change will be public until publishing is completed.',
		'Aucune modification ne sera publique avant la fin de la publication.',
	],
	[
		'La publicación requiere guardar y aprobar la vista previa.',
		'Publishing requires saving and approving the preview.',
		'La publication nécessite l’enregistrement et l’approbation de l’aperçu.',
	],
	['Control de versión', 'Version control', 'Contrôle de version'],
	[
		'Cada cambio queda registrado con usuario, versión, fecha y motivo.',
		'Every change is recorded with user, version, date, and reason.',
		'Chaque modification est enregistrée avec l’utilisateur, la version, la date et le motif.',
	],
	[
		'Vista previa aprobada: listo para publicar.',
		'Preview approved: ready to publish.',
		'Aperçu approuvé : prêt à publier.',
	],
	[
		'Solo el administrador del tenant puede diseñar este formulario.',
		'Only the tenant administrator can design this form.',
		'Seul l’administrateur du tenant peut concevoir ce formulaire.',
	],
	[
		'Nombre, descripción, departamento y responsable siempre permanecen activos.',
		'Name, description, department, and owner always remain active.',
		'Le nom, la description, le département et le responsable restent toujours actifs.',
	],
	['Agregar campo', 'Add field', 'Ajouter un champ'],
	['Texto de ayuda', 'Help text', 'Texte d’aide'],
	['Texto de ejemplo', 'Example text', 'Texte d’exemple'],
	[
		'Opciones, una por línea',
		'Options, one per line',
		'Options, une par ligne',
	],
	['Obligatorio', 'Required', 'Obligatoire'],
	[
		'Así verán el formulario',
		'How the form will appear',
		'Aperçu du formulaire',
	],
	['Canales y recordatorios', 'Channels and reminders', 'Canaux et rappels'],
	[
		'Las alertas críticas permanecen en la aplicación. WhatsApp requiere consentimiento explícito.',
		'Critical alerts remain in the application. WhatsApp requires explicit consent.',
		'Les alertes critiques restent dans l’application. WhatsApp nécessite un consentement explicite.',
	],
	['Correo', 'Email', 'E-mail'],
	['Recordatorios', 'Reminders', 'Rappels'],
	[
		'Actualizaciones opcionales',
		'Optional updates',
		'Mises à jour facultatives',
	],
	['Bandeja inteligente', 'Smart inbox', 'Boîte de réception intelligente'],
	['Historial de alertas', 'Alert history', 'Historique des alertes'],
	[
		'Buscar notificaciones',
		'Search notifications',
		'Rechercher des notifications',
	],
	[
		'Buscar alerta, actividad o canal…',
		'Search alert, activity, or channel…',
		'Rechercher une alerte, une activité ou un canal…',
	],
	[
		'Limpiar búsqueda de notificaciones',
		'Clear notification search',
		'Effacer la recherche des notifications',
	],
	[
		'Filtrar notificaciones',
		'Filter notifications',
		'Filtrer les notifications',
	],
	['Todas', 'All', 'Toutes'],
	['No leídas', 'Unread', 'Non lues'],
	['Leídas', 'Read', 'Lues'],
	['Todo está al día', 'Everything is up to date', 'Tout est à jour'],
	[
		'Las alertas del calendario aparecerán aquí.',
		'Calendar alerts will appear here.',
		'Les alertes du calendrier apparaîtront ici.',
	],
	[
		'No hay alertas que coincidan',
		'No matching alerts',
		'Aucune alerte correspondante',
	],
	[
		'Ajusta la búsqueda o el filtro de lectura.',
		'Adjust the search or read-status filter.',
		'Ajustez la recherche ou le filtre de lecture.',
	],
	['En app', 'In app', 'Dans l’application'],
	['Simulado', 'Simulated', 'Simulé'],
	['Marcar como leída', 'Mark as read', 'Marquer comme lue'],
	[
		'Entregas que requieren atención',
		'Deliveries requiring attention',
		'Envois nécessitant une attention',
	],
	[
		'Proveedor no disponible',
		'Provider unavailable',
		'Fournisseur indisponible',
	],
	['Reintentar', 'Retry', 'Réessayer'],
	['Biblioteca ministerial', 'Ministry library', 'Bibliothèque ministérielle'],
	[
		'Programas claros, accesibles y con propósito.',
		'Clear, accessible, purpose-driven programs.',
		'Des programmes clairs, accessibles et porteurs de sens.',
	],
	[
		'Cada departamento conserva sus programas, guías y documentos en una biblioteca segura, con revisión humana de alineación y vista previa integrada.',
		'Each department keeps its programs, guides, and documents in a secure library with human alignment review and integrated preview.',
		'Chaque département conserve ses programmes, guides et documents dans une bibliothèque sécurisée avec vérification humaine de l’alignement et aperçu intégré.',
	],
	[
		'Busca, filtra, visualiza y descarga sin abandonar GestionChurch.',
		'Search, filter, preview, and download without leaving GestionChurch.',
		'Recherchez, filtrez, consultez et téléchargez sans quitter GestionChurch.',
	],
	[
		'Biblioteca no disponible',
		'Library unavailable',
		'Bibliothèque indisponible',
	],
	[
		'No hay documentos en esta vista',
		'No documents in this view',
		'Aucun document dans cette vue',
	],
	[
		'Carga el primer programa o ajusta los filtros para consultar la biblioteca.',
		'Upload the first program or adjust the filters to browse the library.',
		'Téléversez le premier programme ou ajustez les filtres pour parcourir la bibliothèque.',
	],
	[
		'Filtrar por departamento',
		'Filter by department',
		'Filtrer par département',
	],
	['Filtrar por tipo', 'Filter by type', 'Filtrer par type'],
	['Filtrar por alineación', 'Filter by alignment', 'Filtrer par alignement'],
	[
		'Documento o archivo del programa.',
		'Program document or file.',
		'Document ou fichier du programme.',
	],
	[
		'PDF, Word, Excel, PowerPoint, texto o imagen · máximo 15 MB',
		'PDF, Word, Excel, PowerPoint, text, or image · 15 MB maximum',
		'PDF, Word, Excel, PowerPoint, texte ou image · 15 Mo maximum',
	],
	['Título del programa', 'Program title', 'Titre du programme'],
	[
		'Objetivo y uso de este documento…',
		'Purpose and use of this document…',
		'Objectif et utilisation de ce document…',
	],
	[
		'Declaración de alineación',
		'Alignment statement',
		'Déclaration d’alignement',
	],
	[
		'Describe el propósito y la referencia que conecta este material con la planificación de la Iglesia Adventista.',
		'Describe the purpose and reference connecting this material to Adventist Church planning.',
		'Décrivez l’objectif et la référence reliant ce document à la planification de l’Église adventiste.',
	],
	[
		'Confirmo que el material fue preparado tomando como base la referencia indicada.',
		'I confirm that the material was prepared using the stated reference.',
		'Je confirme que le document a été préparé à partir de la référence indiquée.',
	],
	['Cargar y registrar', 'Upload and register', 'Téléverser et enregistrer'],
	['Cerrar visor', 'Close viewer', 'Fermer la visionneuse'],
	['Descargar', 'Download', 'Télécharger'],
	['Base de alineación', 'Alignment basis', 'Base d’alignement'],
	[
		'La validación final corresponde al liderazgo autorizado; GestionChurch conserva la referencia y la revisión.',
		'Final validation belongs to authorized leadership; GestionChurch retains the reference and review.',
		'La validation finale relève de la direction autorisée; GestionChurch conserve la référence et la révision.',
	],
	['Verificar alineación', 'Verify alignment', 'Vérifier l’alignement'],
	['Notas de alineación', 'Alignment notes', 'Notes d’alignement'],
	['Guardar revisión', 'Save review', 'Enregistrer la vérification'],
	['Alineación declarada', 'Alignment declared', 'Alignement déclaré'],
	['Por revisar', 'Pending review', 'À vérifier'],
	[
		'Guía oficial del departamento',
		'Official department guide',
		'Guide officiel du département',
	],
	[
		'Manual de Iglesia Adventista',
		'Adventist Church Manual',
		'Manuel de l’Église adventiste',
	],
	[
		'Información de la actividad',
		'Activity information',
		'Informations sur l’activité',
	],
	[
		'Describe qué sucederá y quién estará a cargo.',
		'Describe what will happen and who will be in charge.',
		'Décrivez ce qui se passera et qui en sera responsable.',
	],
	['Nombre de la actividad', 'Activity name', 'Nom de l’activité'],
	[
		'Ej. Encuentro de familias',
		'E.g. Family gathering',
		'Ex. Rencontre des familles',
	],
	['Descripción', 'Description', 'Description'],
	[
		'Explica brevemente el propósito y dinámica…',
		'Briefly explain the purpose and format…',
		'Expliquez brièvement l’objectif et le déroulement…',
	],
	['Objetivo', 'Objective', 'Objectif'],
	[
		'¿Qué resultado espera alcanzar?',
		'What outcome do you expect to achieve?',
		'Quel résultat souhaitez-vous atteindre ?',
	],
	['Responsable', 'Owner', 'Responsable'],
	['Teléfono o correo', 'Phone or email', 'Téléphone ou e-mail'],
	['Audiencia', 'Audience', 'Public'],
	['Congregación', 'Congregation', 'Assemblée'],
	['Asistencia estimada', 'Estimated attendance', 'Participation estimée'],
	['Categoría', 'Category', 'Catégorie'],
	['General', 'General', 'Général'],
	['Modalidad', 'Format', 'Modalité'],
	['Presencial', 'In person', 'En présentiel'],
	['Híbrida', 'Hybrid', 'Hybride'],
	['Virtual', 'Virtual', 'Virtuel'],
	['Visibilidad', 'Visibility', 'Visibilité'],
	['Interna', 'Internal', 'Interne'],
	['Público', 'Public', 'Public'],
	[
		'Etiquetas separadas por coma',
		'Tags separated by commas',
		'Étiquettes séparées par des virgules',
	],
	['Notas internas', 'Internal notes', 'Notes internes'],
	['Fecha y horario', 'Date and time', 'Date et heure'],
	[
		'Horario principal y alternativas.',
		'Primary time and alternatives.',
		'Horaire principal et alternatives.',
	],
	['Fecha preferida', 'Preferred date', 'Date préférée'],
	['Inicio', 'Start', 'Début'],
	['Finalización', 'End', 'Fin'],
	['Montaje', 'Setup', 'Installation'],
	['Desmontaje', 'Teardown', 'Démontage'],
	['Agregar otra fecha', 'Add another date', 'Ajouter une autre date'],
	[
		'Validación de conflictos',
		'Conflict validation',
		'Validation des conflits',
	],
	[
		'La disponibilidad será validada',
		'Availability will be validated',
		'La disponibilité sera validée',
	],
	[
		'La disponibilidad se verificará nuevamente al enviar.',
		'Availability will be checked again upon submission.',
		'La disponibilité sera vérifiée à nouveau lors de l’envoi.',
	],
	['Verificar fecha', 'Check date', 'Vérifier la date'],
	[
		'Encontramos una fecha libre',
		'We found an available date',
		'Nous avons trouvé une date disponible',
	],
	[
		'La validación automática no encontró choques para la fecha, el lugar ni los recursos seleccionados.',
		'Automated validation found no conflicts for the selected date, location, or resources.',
		'La validation automatique n’a détecté aucun conflit pour la date, le lieu ou les ressources sélectionnés.',
	],
	[
		'La primera actividad sometida conserva la preferencia. Si continúas, tu actividad quedará registrada para resolución.',
		'The first submitted activity retains priority. If you continue, your activity will be recorded for resolution.',
		'La première activité soumise conserve la priorité. Si vous continuez, votre activité sera enregistrée pour résolution.',
	],
	[
		'La opción principal tiene un choque y la actividad presentada primero conserva la preferencia.',
		'The primary option conflicts, and the activity submitted first retains priority.',
		'L’option principale est en conflit et l’activité soumise en premier conserve la priorité.',
	],
	[
		'Solicitar revisión de la fecha original',
		'Request review of the original date',
		'Demander la révision de la date initiale',
	],
	[
		'Justificación para la junta',
		'Rationale for the board',
		'Justification pour le comité',
	],
	[
		'¿Por qué necesitas conservar esta fecha?',
		'Why do you need to keep this date?',
		'Pourquoi devez-vous conserver cette date ?',
	],
	[
		'Impacto de mover o cancelar',
		'Impact of moving or canceling',
		'Impact d’un déplacement ou d’une annulation',
	],
	[
		'Plan para que ambas actividades coexistan',
		'Plan for both activities to coexist',
		'Plan pour la coexistence des deux activités',
	],
	['Enviar a revisión', 'Submit for review', 'Soumettre à révision'],
	['Guardar como borrador', 'Save as draft', 'Enregistrer comme brouillon'],
	['Enviar actividad', 'Submit activity', 'Soumettre l’activité'],
	['Antes de enviar', 'Before submitting', 'Avant de soumettre'],
	[
		'Confirma la zona horaria',
		'Confirm the time zone',
		'Confirmez le fuseau horaire',
	],
	[
		'Incluye montaje y desmontaje',
		'Include setup and teardown',
		'Incluez l’installation et le démontage',
	],
	[
		'Agrega una alternativa si es posible',
		'Add an alternative if possible',
		'Ajoutez une alternative si possible',
	],
	['Detalle de actividad', 'Activity details', 'Détails de l’activité'],
	[
		'Actividad aprobada y protegida',
		'Approved and protected activity',
		'Activité approuvée et protégée',
	],
	[
		'El cambio no se aplicará hasta que el administrador o secretario lo autorice.',
		'The change will not be applied until the administrator or secretary authorizes it.',
		'La modification ne sera appliquée qu’après autorisation de l’administrateur ou du secrétaire.',
	],
	['Editar actividad', 'Edit activity', 'Modifier l’activité'],
	['Solicitar modificación', 'Request a change', 'Demander une modification'],
	['Motivo del cambio', 'Reason for change', 'Motif de la modification'],
	[
		'Explica por qué es necesario modificar la actividad…',
		'Explain why the activity needs to be changed…',
		'Expliquez pourquoi l’activité doit être modifiée…',
	],
	[
		'Enviar para autorización',
		'Submit for authorization',
		'Soumettre pour autorisation',
	],
	['Cancelar actividad', 'Cancel activity', 'Annuler l’activité'],
	[
		'Tu rol no permite modificar esta actividad.',
		'Your role does not allow changes to this activity.',
		'Votre rôle ne permet pas de modifier cette activité.',
	],
	[
		'Aún no hay archivos adjuntos.',
		'No attachments yet.',
		'Aucune pièce jointe.',
	],
	[
		'Ancianos y próximos cultos',
		'Elders and upcoming services',
		'Anciens et prochains cultes',
	],
	[
		'Turnos, predicación, alabanza y materiales conectados sin crear conflictos artificiales con las actividades de la iglesia.',
		'Rotations, preaching, worship, and materials connected without creating artificial conflicts with church activities.',
		'Tours, prédication, louange et documents connectés sans créer de conflits artificiels avec les activités de l’église.',
	],
	['Mis próximos servicios', 'My upcoming services', 'Mes prochains services'],
	['Turnos de responsabilidad', 'Duty rotations', 'Tours de responsabilité'],
	[
		'Anciano responsable por departamento',
		'Elder responsible by department',
		'Ancien responsable par département',
	],
	[
		'Material listo para Publicidad y Adoración',
		'Material ready for Communications and Worship',
		'Contenu prêt pour Communication et Adoration',
	],
	['Secciones de Ancianos', 'Elders sections', 'Sections des anciens'],
	[
		'Buscar culto, predicador, cantante o himno…',
		'Search service, preacher, singer, or hymn…',
		'Rechercher un culte, un prédicateur, un chanteur ou un cantique…',
	],
	[
		'Buscar anciano o período…',
		'Search elder or period…',
		'Rechercher un ancien ou une période…',
	],
	[
		'Buscar departamento o anciano…',
		'Search department or elder…',
		'Rechercher un département ou un ancien…',
	],
	['Agenda de culto', 'Worship service agenda', 'Programme du culte'],
	['Turnos anuales', 'Annual rotations', 'Tours annuels'],
	['Nuevo turno', 'New rotation', 'Nouveau tour'],
	[
		'Generar calendario anual',
		'Generate annual calendar',
		'Générer le calendrier annuel',
	],
	['Ancianos por semana', 'Elders per week', 'Anciens par semaine'],
	[
		'Ancianos que participan en la rotación',
		'Elders participating in the rotation',
		'Anciens participant au tour',
	],
	[
		'Uno o varios ancianos por semana.',
		'One or more elders per week.',
		'Un ou plusieurs anciens par semaine.',
	],
	[
		'Distribuye automáticamente las semanas entre los ancianos seleccionados. Las semanas existentes se respetan y estas asignaciones nunca generan conflictos departamentales.',
		'Automatically distributes weeks among selected elders. Existing weeks are preserved, and these assignments never create department conflicts.',
		'Répartit automatiquement les semaines entre les anciens sélectionnés. Les semaines existantes sont respectées et ces attributions ne créent jamais de conflits départementaux.',
	],
	[
		'Selecciona al menos un anciano para generar la vista previa.',
		'Select at least one elder to generate the preview.',
		'Sélectionnez au moins un ancien pour générer l’aperçu.',
	],
	[
		'Cobertura departamental',
		'Department coverage',
		'Couverture départementale',
	],
	['Asignar anciano', 'Assign elder', 'Attribuer un ancien'],
	[
		'Relaciona cada departamento con el anciano que le dará acompañamiento.',
		'Link each department to the elder who will support it.',
		'Reliez chaque département à l’ancien qui l’accompagnera.',
	],
	[
		'Selecciona el anciano, los departamentos que acompañará y la vigencia de su responsabilidad.',
		'Select the elder, the departments they will support, and the assignment period.',
		'Sélectionnez l’ancien, les départements qu’il accompagnera et la période de responsabilité.',
	],
	[
		'Programas y documentos',
		'Programs and documents',
		'Programmes et documents',
	],
	[
		'Completa la ficha que recibirán Publicidad y Adoración.',
		'Complete the record that Communications and Worship will receive.',
		'Complétez la fiche destinée à Communication et Adoration.',
	],
	['Tipo de culto', 'Service type', 'Type de culte'],
	['Culto del miércoles', 'Wednesday service', 'Culte du mercredi'],
	['Culto del sábado', 'Sabbath service', 'Culte du sabbat'],
	['Otro encuentro', 'Other gathering', 'Autre rencontre'],
	['Participación musical', 'Musical participation', 'Participation musicale'],
	['Lectura bíblica', 'Bible reading', 'Lecture biblique'],
	['Notas de coordinación', 'Coordination notes', 'Notes de coordination'],
	[
		'Publicar para Publicidad y Adoración',
		'Publish for Communications and Worship',
		'Publier pour Communication et Adoration',
	],
	['Ficha del culto', 'Service record', 'Fiche du culte'],
	[
		'Información lista para el equipo que apoyará cada culto.',
		'Information ready for the team supporting each service.',
		'Informations prêtes pour l’équipe qui soutiendra chaque culte.',
	],
	[
		'Foto del predicador pendiente',
		'Preacher photo pending',
		'Photo du prédicateur en attente',
	],
	[
		'Foto del artista pendiente',
		'Artist photo pending',
		'Photo de l’artiste en attente',
	],
	['Música por confirmar', 'Music to be confirmed', 'Musique à confirmer'],
	[
		'Este culto es compatible con las actividades siguientes y no abre un caso de conflicto.',
		'This service is compatible with the following activities and does not open a conflict case.',
		'Ce culte est compatible avec les activités suivantes et n’ouvre pas de dossier de conflit.',
	],
	[
		'Siempre visible en calendario',
		'Always visible on calendar',
		'Toujours visible au calendrier',
	],
	[
		'Turno publicado. Ya es visible en el calendario y no genera conflictos departamentales.',
		'Rotation published. It is now visible on the calendar and does not create department conflicts.',
		'Tour publié. Il est maintenant visible au calendrier et ne crée pas de conflits départementaux.',
	],
	['Configuración de canales', 'Channel settings', 'Paramètres des canaux'],
	[
		'Configura, protege y prueba las entregas sin editar archivos del servidor. Los secretos se cifran y nunca vuelven a mostrarse.',
		'Configure, secure, and test deliveries without editing server files. Secrets are encrypted and never displayed again.',
		'Configurez, sécurisez et testez les envois sans modifier les fichiers du serveur. Les secrets sont chiffrés et ne sont plus jamais affichés.',
	],
	[
		'Esta configuración está reservada para administradores del tenant.',
		'These settings are restricted to tenant administrators.',
		'Ces paramètres sont réservés aux administrateurs du tenant.',
	],
	[
		'Configuración sincronizada',
		'Settings synchronized',
		'Paramètres synchronisés',
	],
	['Correo transaccional', 'Transactional email', 'E-mail transactionnel'],
	['Servidor SMTP', 'SMTP server', 'Serveur SMTP'],
	['Puerto', 'Port', 'Port'],
	[
		'Recomendado para puerto 587',
		'Recommended for port 587',
		'Recommandé pour le port 587',
	],
	['Usuario SMTP', 'SMTP username', 'Utilisateur SMTP'],
	['Contraseña o API key', 'Password or API key', 'Mot de passe ou clé API'],
	[
		'•••••••••••• (sin cambios)',
		'•••••••••••• (unchanged)',
		'•••••••••••• (inchangé)',
	],
	['Nombre del remitente', 'Sender name', 'Nom de l’expéditeur'],
	['Correo remitente', 'Sender email', 'E-mail de l’expéditeur'],
	[
		'Usar conexión segura',
		'Use secure connection',
		'Utiliser une connexion sécurisée',
	],
	['Exigir TLS', 'Require TLS', 'Exiger TLS'],
	[
		'Compatible con Microsoft 365, Google Workspace, SendGrid, Mailgun y servidores SMTP.',
		'Compatible with Microsoft 365, Google Workspace, SendGrid, Mailgun, and SMTP servers.',
		'Compatible avec Microsoft 365, Google Workspace, SendGrid, Mailgun et les serveurs SMTP.',
	],
	['Probar correo', 'Test email', 'Tester l’e-mail'],
	['Destinatario de prueba', 'Test recipient', 'Destinataire du test'],
	['Enviar prueba', 'Send test', 'Envoyer le test'],
	[
		'Se enviará un mensaje real al destinatario indicado.',
		'A real message will be sent to the specified recipient.',
		'Un message réel sera envoyé au destinataire indiqué.',
	],
	['WhatsApp Business', 'WhatsApp Business', 'WhatsApp Business'],
	[
		'Plantillas aprobadas, consentimiento E.164 y estados de entrega mediante webhook firmado.',
		'Approved templates, E.164 consent, and delivery statuses through a signed webhook.',
		'Modèles approuvés, consentement E.164 et statuts de livraison via un webhook signé.',
	],
	['Modo simulado', 'Simulated mode', 'Mode simulé'],
	['Modo en vivo', 'Live mode', 'Mode réel'],
	['No envía mensajes', 'Does not send messages', 'N’envoie pas de messages'],
	['Número de teléfono ID', 'Phone number ID', 'ID du numéro de téléphone'],
	['Token permanente de Meta', 'Permanent Meta token', 'Jeton permanent Meta'],
	['Token de verificación', 'Verification token', 'Jeton de vérification'],
	[
		'Token privado del webhook',
		'Private webhook token',
		'Jeton privé du webhook',
	],
	[
		'Secreto de la aplicación Meta',
		'Meta application secret',
		'Secret de l’application Meta',
	],
	['Nombre de plantilla', 'Template name', 'Nom du modèle'],
	['Idioma de plantilla', 'Template language', 'Langue du modèle'],
	['Versión Graph API', 'Graph API version', 'Version de l’API Graph'],
	['Webhook del tenant', 'Tenant webhook', 'Webhook du tenant'],
	['Copiar URL', 'Copy URL', 'Copier l’URL'],
	[
		'URL del webhook copiada al portapapeles.',
		'Webhook URL copied to the clipboard.',
		'URL du webhook copiée dans le presse-papiers.',
	],
	[
		'Usa un número autorizado en formato internacional.',
		'Use an authorized number in international format.',
		'Utilisez un numéro autorisé au format international.',
	],
	['Probar WhatsApp', 'Test WhatsApp', 'Tester WhatsApp'],
	[
		'Guarda antes de ejecutar una prueba.',
		'Save before running a test.',
		'Enregistrez avant d’exécuter un test.',
	],
	[
		'Guarda los cambios antes de probar el canal.',
		'Save changes before testing the channel.',
		'Enregistrez les modifications avant de tester le canal.',
	],
	[
		'Configuración cifrada y guardada. Ya puedes ejecutar las pruebas de entrega.',
		'Encrypted settings saved. You can now run delivery tests.',
		'Paramètres chiffrés enregistrés. Vous pouvez maintenant exécuter les tests d’envoi.',
	],
	[
		'Entrega real, verificable y lista para producción.',
		'Real, verifiable delivery ready for production.',
		'Livraison réelle, vérifiable et prête pour la production.',
	],
	[
		'Conecta la infraestructura de tu iglesia, valida cada proveedor y confirma una entrega real. Los secretos permanecen cifrados y cada operación queda auditada.',
		'Connect your church infrastructure, validate each provider, and confirm a real delivery. Secrets remain encrypted and every operation is audited.',
		'Connectez l’infrastructure de votre église, validez chaque fournisseur et confirmez une livraison réelle. Les secrets restent chiffrés et chaque opération est auditée.',
	],
	[
		'Verificación y entrega real',
		'Verification and real delivery',
		'Vérification et livraison réelle',
	],
	[
		'Primero valida DNS, TLS y autenticación; luego confirma una entrega al destinatario.',
		'First validate DNS, TLS, and authentication; then confirm delivery to the recipient.',
		'Validez d’abord le DNS, le TLS et l’authentification, puis confirmez la livraison au destinataire.',
	],
	['Producción real', 'Real production', 'Production réelle'],
	[
		'Webhook HTTPS público del tenant',
		'Public HTTPS tenant webhook',
		'Webhook HTTPS public du tenant',
	],
	[
		'Validación directa con Meta',
		'Direct validation with Meta',
		'Validation directe avec Meta',
	],
	[
		'Confirma credenciales, número empresarial y una entrega real en formato E.164.',
		'Confirm credentials, business number, and a real delivery in E.164 format.',
		'Confirmez les identifiants, le numéro professionnel et une livraison réelle au format E.164.',
	],
	[
		'Destinatario de prueba SMTP',
		'SMTP test recipient',
		'Destinataire du test SMTP',
	],
	[
		'Número de prueba WhatsApp',
		'WhatsApp test number',
		'Numéro de test WhatsApp',
	],
	[
		'Configuración cifrada y guardada. Valida la conexión y ejecuta una entrega real antes de publicar.',
		'Encrypted settings saved. Validate the connection and run a real delivery before publishing.',
		'Paramètres chiffrés enregistrés. Validez la connexion et effectuez une livraison réelle avant de publier.',
	],
	[
		'Guarda los cambios antes de validar la conexión.',
		'Save changes before validating the connection.',
		'Enregistrez les modifications avant de valider la connexion.',
	],
	[
		'No fue posible validar la conexión.',
		'The connection could not be validated.',
		'La connexion n’a pas pu être validée.',
	],
	['Producción', 'Production', 'Production'],
	[
		'Configura la clave de producción',
		'Configure the production key',
		'Configurez la clé de production',
	],
	[
		'Clave requerida en producción',
		'Key required in production',
		'Clé requise en production',
	],
	['Sin validar', 'Not validated', 'Non validé'],
	['Accesible por Meta', 'Accessible by Meta', 'Accessible par Meta'],
	[
		'Configura PUBLIC_API_URL con HTTPS público',
		'Configure PUBLIC_API_URL with public HTTPS',
		'Configurez PUBLIC_API_URL avec un accès HTTPS public',
	],
	['Cambios pendientes', 'Pending changes', 'Modifications en attente'],
	['Guardar configuración', 'Save settings', 'Enregistrer les paramètres'],
	['Nombramientos de iglesia', 'Church nominations', 'Nominations de l’église'],
	[
		'Accede exclusivamente al módulo completo de Nombramientos.',
		'Access the complete Nominations module securely.',
		'Accédez en toute sécurité au module complet Nominations.',
	],
	[
		'Validamos tu iglesia y tus roles sin solicitar otra contraseña.',
		'We validate your church and roles without asking for another password.',
		'Nous validons votre église et vos rôles sans demander un autre mot de passe.',
	],
	[
		'Acceso aislado por tenant y auditado de extremo a extremo.',
		'Tenant-isolated access with end-to-end auditing.',
		'Accès isolé par tenant avec audit de bout en bout.',
	],
	[
		'Comisión de nombramientos',
		'Nominating committee',
		'Commission des nominations',
	],
	[
		'Acceso restringido a responsables de GestionChurch.',
		'Access restricted to authorized GestionChurch users.',
		'Accès réservé aux responsables autorisés de GestionChurch.',
	],
	['Abrir Nombramientos', 'Open Nominations', 'Ouvrir Nominations'],
	[
		'No pudimos abrir Nombramientos',
		'We could not open Nominations',
		'Nous n’avons pas pu ouvrir Nominations',
	],
	[
		'Tu sesión de GestionChurch continúa protegida. Puedes volver a intentar.',
		'Your GestionChurch session remains protected. You can try again.',
		'Votre session GestionChurch reste protégée. Vous pouvez réessayer.',
	],
	['Iglesias y tenants', 'Churches and tenants', 'Églises et tenants'],
	[
		'Tu iglesia, bajo control.',
		'Your church, under control.',
		'Votre église, sous contrôle.',
	],
	[
		'Calendario y coordinación de actividades para iglesias.',
		'Church activity calendar and coordination.',
		'Calendrier et coordination des activités de l’église.',
	],
	[
		'Buscar iglesias y tenants',
		'Search churches and tenants',
		'Rechercher des églises et tenants',
	],
	[
		'Buscar iglesia, subdominio o zona horaria…',
		'Search church, subdomain, or time zone…',
		'Rechercher une église, un sous-domaine ou un fuseau horaire…',
	],
	[
		'Limpiar búsqueda de iglesias',
		'Clear church search',
		'Effacer la recherche d’églises',
	],
	[
		'Prueba con otro nombre, subdominio o zona horaria.',
		'Try another name, subdomain, or time zone.',
		'Essayez un autre nom, sous-domaine ou fuseau horaire.',
	],
	[
		'Provisiona la primera iglesia.',
		'Provision the first church.',
		'Provisionnez la première église.',
	],
	[
		'Define su identidad visual y deja el espacio listo para asignar dirección y equipo.',
		'Define its visual identity and prepare the workspace for leadership and team assignments.',
		'Définissez son identité visuelle et préparez l’espace pour attribuer la direction et l’équipe.',
	],
	[
		'Se creará una base PostgreSQL física y aislada.',
		'A physically isolated PostgreSQL database will be created.',
		'Une base de données PostgreSQL physiquement isolée sera créée.',
	],
	[
		'Las credenciales nunca se devuelven al navegador.',
		'Credentials are never returned to the browser.',
		'Les identifiants ne sont jamais renvoyés au navigateur.',
	],
	['Auditoría activa', 'Active auditing', 'Audit actif'],
	[
		'Datos aislados del tenant y generados en tiempo real',
		'Tenant-isolated data generated in real time',
		'Données isolées du tenant et générées en temps réel',
	],
	[
		'Base independiente',
		'Independent database',
		'Base de données indépendante',
	],
	['Año ministerial', 'Ministry year', 'Année ministérielle'],
	['Liderazgo de la iglesia', 'Church leadership', 'Direction de l’église'],
	[
		'Organiza y da seguimiento a la planificación.',
		'Organize and track planning.',
		'Organisez et suivez la planification.',
	],
	[
		'Organiza, edita y da seguimiento a la planificación.',
		'Organize, edit, and track planning.',
		'Organisez, modifiez et suivez la planification.',
	],
	[
		'Control total antes de aprobación y solicitudes de cambio posteriores.',
		'Full control before approval and subsequent change requests.',
		'Contrôle total avant approbation et demandes de modification ultérieures.',
	],
	[
		'Publica y administra actividades antes de aprobación.',
		'Publish and manage activities before approval.',
		'Publiez et gérez les activités avant approbation.',
	],
	[
		'Prepara borradores de sus actividades.',
		'Prepares activity drafts.',
		'Prépare les brouillons de ses activités.',
	],
	[
		'Puede consultar la información del departamento.',
		'Can view department information.',
		'Peut consulter les informations du département.',
	],
	[
		'Acceso de lectura al calendario y al departamento.',
		'Read access to the calendar and department.',
		'Accès en lecture au calendrier et au département.',
	],
	[
		'Participa en las juntas y emite recomendaciones.',
		'Participates in board sessions and makes recommendations.',
		'Participe aux sessions et formule des recommandations.',
	],
	[
		'Consulta calendario y trazabilidad.',
		'Views calendar and audit trail.',
		'Consulte le calendrier et la traçabilité.',
	],
	['Seguimiento automático', 'Automatic follow-up', 'Suivi automatique'],
	[
		'Convocatorias, calendario personal, WhatsApp, asistencia y actas en un solo lugar.',
		'Invitations, personal calendar, WhatsApp, attendance, and minutes in one place.',
		'Invitations, calendrier personnel, WhatsApp, présence et procès-verbaux en un seul endroit.',
	],
	['Crear sesión', 'Create session', 'Créer une session'],
	[
		'Crear sesión de junta',
		'Create board session',
		'Créer une session du comité',
	],
	[
		'Cerrar creador de sesión',
		'Close session creator',
		'Fermer le créateur de session',
	],
	[
		'Junta de revisión de actividades',
		'Activity review board',
		'Comité de révision des activités',
	],
	['Fecha y lugar', 'Date and location', 'Date et lieu'],
	[
		'Sala pastoral o enlace de videollamada',
		'Pastoral room or video-call link',
		'Salle pastorale ou lien de visioconférence',
	],
	['Agenda de la junta', 'Board agenda', 'Ordre du jour du comité'],
	[
		'Registra participantes, acuerdos, responsables y próximos pasos…',
		'Record participants, agreements, owners, and next steps…',
		'Consignez les participants, les accords, les responsables et les prochaines étapes…',
	],
	['Participantes', 'Participants', 'Participants'],
	['Buscar participante', 'Search participant', 'Rechercher un participant'],
	[
		'Seleccione al menos un participante con usuario.',
		'Select at least one participant with a user account.',
		'Sélectionnez au moins un participant disposant d’un compte utilisateur.',
	],
	[
		'Cada invitado recibirá el evento en su calendario y alertas según sus preferencias.',
		'Each guest will receive the event in their calendar and alerts according to their preferences.',
		'Chaque invité recevra l’événement dans son calendrier et les alertes selon ses préférences.',
	],
	['Casos para revisar', 'Cases to review', 'Dossiers à examiner'],
	[
		'Vincular este caso a una sesión',
		'Link this case to a session',
		'Lier ce dossier à une session',
	],
	[
		'Crear y enviar convocatoria',
		'Create and send invitation',
		'Créer et envoyer l’invitation',
	],
	['Iniciar junta', 'Start session', 'Démarrer la session'],
	['Registrar asistencia', 'Record attendance', 'Enregistrer la présence'],
	['Acta de la sesión', 'Session minutes', 'Procès-verbal de la session'],
	['Guardar acta', 'Save minutes', 'Enregistrer le procès-verbal'],
	['Sala de juntas', 'Board room', 'Salle du comité'],
	['Sin responder', 'No response', 'Sans réponse'],
	[
		'Sin consentimiento WhatsApp',
		'No WhatsApp consent',
		'Sans consentement WhatsApp',
	],
	[
		'Recomendaciones de revisores',
		'Reviewer recommendations',
		'Recommandations des réviseurs',
	],
	['Decisión', 'Decision', 'Décision'],
	['Abstención', 'Abstention', 'Abstention'],
	[
		'Registra el fundamento y los acuerdos…',
		'Record the rationale and agreements…',
		'Consignez le fondement et les accords…',
	],
	['Nota de decisión', 'Decision note', 'Note de décision'],
	[
		'Documenta el fundamento de la decisión…',
		'Document the rationale for the decision…',
		'Documentez le fondement de la décision…',
	],
	['Autorizar y aplicar', 'Authorize and apply', 'Autoriser et appliquer'],
	[
		'Cambios propuestos por directores después de la aprobación.',
		'Changes proposed by directors after approval.',
		'Modifications proposées par les directeurs après approbation.',
	],
	[
		'No hay solicitudes de modificación que coincidan con la búsqueda.',
		'No change requests match the search.',
		'Aucune demande de modification ne correspond à la recherche.',
	],
	[
		'No hay aprobaciones que coincidan con la búsqueda.',
		'No approvals match the search.',
		'Aucune approbation ne correspond à la recherche.',
	],
	[
		'No hay conflictos que coincidan con la búsqueda.',
		'No conflicts match the search.',
		'Aucun conflit ne correspond à la recherche.',
	],
	[
		'Fecha y horario exactos en disputa',
		'Exact disputed date and time',
		'Date et heure exactes contestées',
	],
	[
		'Regla de preferencia activa',
		'Active priority rule',
		'Règle de priorité active',
	],
	[
		'La primera solicitud válida conserva prioridad. La coexistencia solo puede aprobarse mediante una decisión documentada.',
		'The first valid request retains priority. Coexistence can only be approved through a documented decision.',
		'La première demande valide conserve la priorité. La coexistence ne peut être approuvée que par une décision documentée.',
	],
	[
		'2ª solicitud · En revisión',
		'2nd request · Under review',
		'2e demande · En révision',
	],
	['Presentada después', 'Submitted later', 'Soumise ultérieurement'],
	[
		'Resolución sin colisiones',
		'Conflict-free resolution',
		'Résolution sans collision',
	],
	[
		'Agrega alternativas en orden de preferencia.',
		'Add alternatives in order of preference.',
		'Ajoutez les alternatives par ordre de préférence.',
	],
	[
		'Complete el nombre, inicio y finalización de la alternativa.',
		'Complete the alternative name, start, and end.',
		'Renseignez le nom, le début et la fin de l’alternative.',
	],
	[
		'La alternativa dejó de estar disponible.',
		'The alternative is no longer available.',
		'L’alternative n’est plus disponible.',
	],
	[
		'Seleccione una opción libre para que la secretaría pueda autorizarla.',
		'Select an available option for the secretary to authorize.',
		'Sélectionnez une option disponible afin que le secrétariat puisse l’autoriser.',
	],
	[
		'La secretaría ya puede revisar el expediente comparativo completo.',
		'The secretary can now review the complete comparative record.',
		'Le secrétariat peut maintenant examiner le dossier comparatif complet.',
	],
	[
		'Acompañamiento pastoral y coordinación',
		'Pastoral support and coordination',
		'Accompagnement pastoral et coordination',
	],
	[
		'Programa turnos anuales y coordina la agenda del cuerpo de ancianos.',
		'Schedule annual rotations and coordinate the elders’ agenda.',
		'Planifiez les tours annuels et coordonnez l’agenda du corps des anciens.',
	],
	[
		'Gestiona su agenda de cultos, predicadores, música y lecturas.',
		'Manage service schedules, preachers, music, and readings.',
		'Gérez les cultes, les prédicateurs, la musique et les lectures.',
	],
	[
		'Asignaciones visibles que acompañan la agenda sin generar conflictos.',
		'Visible assignments that support the agenda without creating conflicts.',
		'Attributions visibles qui accompagnent l’agenda sans créer de conflits.',
	],
	['Operación de cultos', 'Worship operations', 'Organisation des cultes'],
	[
		'Conecta cada ministerio con un anciano durante un período definido.',
		'Connect each ministry with an elder for a defined period.',
		'Reliez chaque ministère à un ancien pendant une période définie.',
	],
	[
		'Una asignación indica quién coordina los cultos. Puede coincidir con actividades departamentales porque no reserva lugar, equipo ni horario.',
		'An assignment indicates who coordinates services. It may coincide with department activities because it does not reserve a location, equipment, or time.',
		'Une attribution indique qui coordonne les cultes. Elle peut coïncider avec des activités départementales car elle ne réserve ni lieu, ni équipement, ni horaire.',
	],
	[
		'Aún no hay coberturas asignadas',
		'No coverage assignments yet',
		'Aucune couverture attribuée',
	],
	[
		'Buscar cobertura departamental',
		'Search department coverage',
		'Rechercher une couverture départementale',
	],
	[
		'Cobertura departamental publicada. El anciano recibió una notificación en su centro de alertas.',
		'Department coverage published. The elder received a notification in the alert center.',
		'Couverture départementale publiée. L’ancien a reçu une notification dans son centre d’alertes.',
	],
	[
		'La cobertura departamental fue cerrada y quedó registrada en la auditoría.',
		'The department coverage was closed and recorded in the audit log.',
		'La couverture départementale a été clôturée et enregistrée dans l’audit.',
	],
	[
		'Borrador guardado en la agenda del anciano.',
		'Draft saved in the elder’s agenda.',
		'Brouillon enregistré dans l’agenda de l’ancien.',
	],
	[
		'Programa publicado y compartido con Publicidad y Adoración.',
		'Program published and shared with Communications and Worship.',
		'Programme publié et partagé avec Communication et Adoration.',
	],
	[
		'Los programas publicados por Ancianos aparecerán aquí automáticamente.',
		'Programs published by Elders will appear here automatically.',
		'Les programmes publiés par les anciens apparaîtront ici automatiquement.',
	],
	[
		'Consulta participantes, imágenes, himno y lectura en una sola ficha. Solo aparecen programas publicados.',
		'View participants, images, hymn, and reading in one record. Only published programs appear.',
		'Consultez les participants, les images, le cantique et la lecture dans une seule fiche. Seuls les programmes publiés apparaissent.',
	],
	[
		'Crear el primer programa',
		'Create the first program',
		'Créer le premier programme',
	],
	[
		'Crea el primer programa y completa sus participantes.',
		'Create the first program and complete its participants.',
		'Créez le premier programme et renseignez ses participants.',
	],
	[
		'Calendario anual de cobertura pastoral.',
		'Annual pastoral coverage calendar.',
		'Calendrier annuel de couverture pastorale.',
	],
	['Plan anual de la iglesia', 'Annual church plan', 'Plan annuel de l’église'],
	['Plan estratégico local', 'Local strategic plan', 'Plan stratégique local'],
	['Programa departamental', 'Department program', 'Programme départemental'],
	['Ministerio alineado', 'Aligned ministry', 'Ministère aligné'],
	['Ministerio coordinado', 'Coordinated ministry', 'Ministère coordonné'],
	[
		'Revisado conforme al programa y lineamientos vigentes.',
		'Reviewed against the current program and guidelines.',
		'Vérifié conformément au programme et aux directives en vigueur.',
	],
	[
		'Quedará como “alineación declarada” hasta la revisión del liderazgo autorizado.',
		'It will remain “declared alignment” until reviewed by authorized leadership.',
		'Il restera en « alignement déclaré » jusqu’à l’examen par la direction autorisée.',
	],
	[
		'Documento cargado, analizado y registrado para revisión de alineación.',
		'Document uploaded, analyzed, and recorded for alignment review.',
		'Document téléversé, analysé et enregistré pour vérification de l’alignement.',
	],
	[
		'La revisión de alineación fue registrada con trazabilidad.',
		'The alignment review was recorded with an audit trail.',
		'La vérification de l’alignement a été enregistrée avec traçabilité.',
	],
	[
		'El documento fue retirado de manera auditable.',
		'The document was removed with an audit trail.',
		'Le document a été retiré de manière traçable.',
	],
	[
		'Versionado · antivirus · auditoría',
		'Versioning · antivirus · auditing',
		'Versionnage · antivirus · audit',
	],
	[
		'Máximo 15 MB · será validado antes de publicarse',
		'15 MB maximum · validated before publishing',
		'15 Mo maximum · validation avant publication',
	],
	[
		'Seleccione el documento que desea cargar.',
		'Select the document to upload.',
		'Sélectionnez le document à téléverser.',
	],
	['Seleccionar documento', 'Select document', 'Sélectionner un document'],
	['Otro documento', 'Other document', 'Autre document'],
	[
		'Orientación breve para completar el campo',
		'Brief guidance for completing the field',
		'Brève indication pour remplir le champ',
	],
	[
		'Texto, lista, fecha y más',
		'Text, list, date, and more',
		'Texte, liste, date et plus',
	],
	['Lista de opciones', 'Options list', 'Liste d’options'],
	['Selecciona un campo', 'Select a field', 'Sélectionnez un champ'],
	[
		'Borrador guardado. El formulario publicado todavía no cambió.',
		'Draft saved. The published form has not changed yet.',
		'Brouillon enregistré. Le formulaire publié n’a pas encore changé.',
	],
	[
		'Vista previa aprobada. Guarda el borrador si es necesario y luego publícalo.',
		'Preview approved. Save the draft if needed, then publish it.',
		'Aperçu approuvé. Enregistrez le brouillon si nécessaire, puis publiez-le.',
	],
	[
		'Acompañamiento ministerial',
		'Ministry support',
		'Accompagnement ministériel',
	],
	['Actividad enviada', 'Activity submitted', 'Activité soumise'],
	[
		'Actividad finalizada pendiente de cierre',
		'Finished activity pending closure',
		'Activité terminée en attente de clôture',
	],
	['Actividad protegida', 'Protected activity', 'Activité protégée'],
	[
		'Actividades completadas de los últimos seis meses',
		'Completed activities from the last six months',
		'Activités terminées des six derniers mois',
	],
	[
		'Actividades completadas del reporte',
		'Completed activities in the report',
		'Activités terminées du rapport',
	],
	[
		'Actividades con cambios solicitados',
		'Activities with requested changes',
		'Activités avec modifications demandées',
	],
	[
		'Actividades en revisión',
		'Activities under review',
		'Activités en révision',
	],
	[
		'Actividades vencidas de los últimos seis meses',
		'Overdue activities from the last six months',
		'Activités en retard des six derniers mois',
	],
	[
		'Actividades vencidas del reporte',
		'Overdue activities in the report',
		'Activités en retard du rapport',
	],
	[
		'Actualiza el contenido operativo que verá el equipo.',
		'Update the operational content the team will see.',
		'Mettez à jour le contenu opérationnel visible par l’équipe.',
	],
	[
		'Actualización autorizada de la actividad',
		'Authorized activity update',
		'Mise à jour autorisée de l’activité',
	],
	['Actualización completada', 'Update completed', 'Mise à jour terminée'],
	[
		'Agrega próximas actividades para generar proyecciones individuales.',
		'Add upcoming activities to generate individual projections.',
		'Ajoutez des activités à venir pour générer des projections individuelles.',
	],
	['Anciano', 'Elder', 'Ancien'],
	['Año', 'Year', 'Année'],
	[
		'Aquí podrás configurar su equipo y responsabilidades.',
		'Here you can configure the team and responsibilities.',
		'Vous pourrez ici configurer l’équipe et les responsabilités.',
	],
	[
		'Aquí verás las actividades relacionadas y podrás registrar la decisión.',
		'Related activities will appear here, and you can record the decision.',
		'Les activités associées apparaîtront ici et vous pourrez enregistrer la décision.',
	],
	[
		'Asigna un director y los demás integrantes con su rol correspondiente.',
		'Assign a director and the remaining members with their corresponding roles.',
		'Attribuez un directeur et les autres membres avec leurs rôles respectifs.',
	],
	[
		'Aún no hay historial suficiente',
		'Not enough history yet',
		'Historique encore insuffisant',
	],
	[
		'Buscar departamento o director…',
		'Search department or director…',
		'Rechercher un département ou un directeur…',
	],
	[
		'Buscar sesiones de junta',
		'Search board sessions',
		'Rechercher des sessions du comité',
	],
	['Búsqueda transversal', 'Universal search', 'Recherche transversale'],
	['Cerrar creador', 'Close creator', 'Fermer le créateur'],
	['ciclo aún abierto', 'cycle still open', 'cycle encore ouvert'],
	[
		'Código, actividad, departamento, responsable…',
		'Code, activity, department, owner…',
		'Code, activité, département, responsable…',
	],
	[
		'Completa los datos solicitados.',
		'Complete the requested information.',
		'Complétez les informations demandées.',
	],
	[
		'Complete fecha, horario y agenda de la junta.',
		'Complete the board date, time, and agenda.',
		'Renseignez la date, l’heure et l’ordre du jour du comité.',
	],
	['Composición', 'Composition', 'Composition'],
	['Con conflicto', 'With conflict', 'Avec conflit'],
	[
		'Confirma que se realizó para reflejarla como completada en el centro de control.',
		'Confirm it took place to mark it completed in the control center.',
		'Confirmez sa réalisation pour la marquer comme terminée dans le centre de contrôle.',
	],
	['Confirmación', 'Confirmation', 'Confirmation'],
	[
		'coordinación con propósito',
		'coordination with purpose',
		'coordination porteuse de sens',
	],
	[
		'Coordinación y seguimiento',
		'Coordination and follow-up',
		'Coordination et suivi',
	],
	[
		'Crea departamentos, incorpora personas y define exactamente lo que cada rol puede hacer.',
		'Create departments, add people, and define exactly what each role can do.',
		'Créez des départements, ajoutez des personnes et définissez précisément les actions de chaque rôle.',
	],
	[
		'Datos base del pronóstico',
		'Forecast data basis',
		'Données de base des prévisions',
	],
	[
		'Decisiones claras, respaldadas por datos.',
		'Clear decisions backed by data.',
		'Des décisions claires fondées sur les données.',
	],
	['Deja constancia del motivo…', 'Record the reason…', 'Consignez le motif…'],
	['Dejar para después', 'Do it later', 'Remettre à plus tard'],
	[
		'Departamento creado y listo para recibir su equipo.',
		'Department created and ready for its team.',
		'Département créé et prêt à accueillir son équipe.',
	],
	[
		'Departamentos acompañados',
		'Supported departments',
		'Départements accompagnés',
	],
	[
		'Detalle del conflicto detectado',
		'Detected conflict details',
		'Détails du conflit détecté',
	],
	['días', 'days', 'jours'],
	[
		'Distribución de espacios y recursos',
		'Location and resource allocation',
		'Répartition des espaces et des ressources',
	],
	['Edición controlada', 'Controlled editing', 'Modification contrôlée'],
	['Editar programa', 'Edit program', 'Modifier le programme'],
	[
		'Ej. Culto divino de esperanza',
		'E.g. Hope worship service',
		'Ex. Culte d’espérance',
	],
	[
		'Ej. Domingo por la tarde',
		'E.g. Sunday afternoon',
		'Ex. Dimanche après-midi',
	],
	[
		'Ej. Ministerio de la Mujer',
		'E.g. Women’s Ministries',
		'Ex. Ministère des femmes',
	],
	[
		'Ej. Programa anual de Jóvenes',
		'E.g. Annual Youth program',
		'Ex. Programme annuel de la jeunesse',
	],
	[
		'El choque quedó registrado como un conflicto formal. La actividad presentada primero conserva la preferencia hasta que la junta autorice otra decisión.',
		'The overlap was recorded as a formal conflict. The activity submitted first retains priority until the board authorizes another decision.',
		'Le chevauchement a été enregistré comme conflit formel. L’activité soumise en premier conserve la priorité jusqu’à ce que le comité autorise une autre décision.',
	],
	[
		'El horario actual se conservará',
		'The current time will be retained',
		'L’horaire actuel sera conservé',
	],
	[
		'El horario se revalida contra todas las reservas antes de guardarse.',
		'The time is revalidated against all reservations before saving.',
		'L’horaire est revérifié par rapport à toutes les réservations avant l’enregistrement.',
	],
	[
		'El pronóstico mejorará a medida que se gestionen actividades.',
		'The forecast will improve as activities are managed.',
		'Les prévisions s’amélioreront à mesure que les activités seront gérées.',
	],
	['EN COLA', 'QUEUED', 'EN FILE'],
	[
		'Enlaza el usuario con el departamento de Ancianos para activar su agenda ministerial.',
		'Link the user to the Elders department to activate the ministry agenda.',
		'Associez l’utilisateur au département des anciens pour activer son agenda ministériel.',
	],
	['Escribe una respuesta', 'Write a response', 'Rédiger une réponse'],
	['Español (es)', 'Spanish (es)', 'Espagnol (es)'],
	['Español RD (es_DO)', 'Spanish DR (es_DO)', 'Espagnol RD (es_DO)'],
	[
		'Estas asignaciones controlan lo que puede hacer en el calendario.',
		'These assignments control what the user can do in the calendar.',
		'Ces attributions déterminent les actions possibles dans le calendrier.',
	],
	[
		'Explique cómo contribuye a la misión…',
		'Explain how it contributes to the mission…',
		'Expliquez sa contribution à la mission…',
	],
	['Explorar período', 'Explore period', 'Explorer la période'],
	['Fecha autorizada', 'Authorized date', 'Date autorisée'],
	['Filtros del gráfico', 'Chart filters', 'Filtres du graphique'],
	['Guardar y compartir', 'Save and share', 'Enregistrer et partager'],
	['Guía', 'Guide', 'Guide'],
	[
		'Hay cambios sin guardar',
		'There are unsaved changes',
		'Des modifications ne sont pas enregistrées',
	],
	[
		'Información actualizada',
		'Updated information',
		'Informations mises à jour',
	],
	['Informe', 'Report', 'Rapport'],
	['Ir al calendario', 'Go to calendar', 'Aller au calendrier'],
	[
		'JPG, PNG o WebP · máximo 5 MB',
		'JPG, PNG, or WebP · 5 MB maximum',
		'JPG, PNG ou WebP · 5 Mo maximum',
	],
	['Justificación', 'Rationale', 'Justification'],
	[
		'La actividad mantiene intacta su aprobación y reserva hasta que una autoridad revise esta propuesta.',
		'The activity keeps its approval and reservation intact until an authority reviews this proposal.',
		'L’activité conserve son approbation et sa réservation jusqu’à l’examen de cette proposition par une autorité.',
	],
	[
		'La agenda está disponible',
		'The schedule is available',
		'L’agenda est disponible',
	],
	[
		'La fecha quedó reservada provisionalmente y espera aprobación.',
		'The date is provisionally reserved and awaiting approval.',
		'La date est réservée provisoirement et attend une approbation.',
	],
	[
		'La finalización debe ser posterior al inicio.',
		'The end must be after the start.',
		'La fin doit être postérieure au début.',
	],
	[
		'Las actividades vencidas, detenidas o con conflictos aparecerán aquí.',
		'Overdue, stalled, or conflicted activities will appear here.',
		'Les activités en retard, bloquées ou en conflit apparaîtront ici.',
	],
	[
		'Limpiar búsqueda de departamentos',
		'Clear department search',
		'Effacer la recherche de départements',
	],
	[
		'Limpiar búsqueda de sesiones',
		'Clear session search',
		'Effacer la recherche de sessions',
	],
	[
		'Limpiar búsqueda de usuarios',
		'Clear user search',
		'Effacer la recherche d’utilisateurs',
	],
	[
		'Localiza cualquier caso o solicitud',
		'Find any case or request',
		'Trouvez tout dossier ou demande',
	],
	[
		'Los cambios de horario se validan nuevamente contra todo el calendario.',
		'Schedule changes are revalidated against the entire calendar.',
		'Les changements d’horaire sont revérifiés par rapport à l’ensemble du calendrier.',
	],
	['Nota de acompañamiento', 'Support note', 'Note d’accompagnement'],
	['Nota para el equipo', 'Team note', 'Note pour l’équipe'],
	['Nueva credencial', 'New credential', 'Nouvel identifiant'],
	['Nuevo horario propuesto', 'New proposed time', 'Nouvel horaire proposé'],
	[
		'Nuevo recurso ministerial',
		'New ministry resource',
		'Nouvelle ressource ministérielle',
	],
	['Número', 'Number', 'Numéro'],
	['Opción 1', 'Option 1', 'Option 1'],
	['Opción 2', 'Option 2', 'Option 2'],
	[
		'Ordenado por impacto y antigüedad.',
		'Sorted by impact and age.',
		'Trié par impact et ancienneté.',
	],
	['Participación', 'Participation', 'Participation'],
	[
		'Planificación de los últimos seis meses',
		'Planning for the last six months',
		'Planification des six derniers mois',
	],
	[
		'Planificación departamental',
		'Department planning',
		'Planification départementale',
	],
	['Plano de control', 'Control map', 'Plan de contrôle'],
	['Programa', 'Program', 'Programme'],
	[
		'Pronóstico en aprendizaje',
		'Forecast learning',
		'Prévisions en apprentissage',
	],
	[
		'Propósito, frecuencia de seguimiento o acuerdos…',
		'Purpose, follow-up frequency, or agreements…',
		'Objectif, fréquence de suivi ou accords…',
	],
	['Protección', 'Protection', 'Protection'],
	[
		'Prueba con otro nombre o responsable.',
		'Try another name or owner.',
		'Essayez un autre nom ou responsable.',
	],
	['Revisión autorizada', 'Authorized review', 'Révision autorisée'],
	[
		'Revisión de actividades pendientes, análisis de conflictos y registro de acuerdos.',
		'Review of pending activities, conflict analysis, and agreement records.',
		'Révision des activités en attente, analyse des conflits et consignation des accords.',
	],
	[
		'Secretaría departamental',
		'Department secretary',
		'Secrétariat départemental',
	],
	['Selecciona el programa', 'Select the program', 'Sélectionnez le programme'],
	[
		'Selecciona un rango diferente para comparar rendimiento.',
		'Select a different range to compare performance.',
		'Sélectionnez une autre période pour comparer les performances.',
	],
	['Selecciona una persona…', 'Select a person…', 'Sélectionnez une personne…'],
	[
		'Selecciona uno o varios ancianos. Este bloque será informativo y no reservará recursos.',
		'Select one or more elders. This block is informational and will not reserve resources.',
		'Sélectionnez un ou plusieurs anciens. Ce bloc est informatif et ne réservera aucune ressource.',
	],
	['Seleccionar', 'Select', 'Sélectionner'],
	['señal', 'signal', 'signal'],
	['Sin casos de conflicto', 'No conflict cases', 'Aucun dossier de conflit'],
	[
		'Sin departamento asignado',
		'No department assigned',
		'Aucun département attribué',
	],
	[
		'Sin departamentos en el período',
		'No departments in the period',
		'Aucun département sur la période',
	],
	['Sin lugar exclusivo', 'No exclusive location', 'Aucun lieu exclusif'],
	['Sin probar', 'Untested', 'Non testé'],
	['Sin turno activo', 'No active rotation', 'Aucun tour actif'],
	['Sin turno relacionado', 'No related rotation', 'Aucun tour associé'],
	['Solo departamento', 'Department only', 'Département uniquement'],
	['Toda la iglesia', 'Entire church', 'Toute l’église'],
	[
		'Trazabilidad por responsable',
		'Owner traceability',
		'Traçabilité par responsable',
	],
	['Tu departamento', 'Your department', 'Votre département'],
	['un horario', 'one time slot', 'un créneau'],
	[
		'Un lugar para cada equipo y cada responsabilidad',
		'A place for every team and every responsibility',
		'Une place pour chaque équipe et chaque responsabilité',
	],
	[
		'Use el centro de sesiones para convocar usuarios, enviar alertas y dar seguimiento.',
		'Use the session center to invite users, send alerts, and track follow-up.',
		'Utilisez le centre de sessions pour inviter les utilisateurs, envoyer des alertes et assurer le suivi.',
	],
	[
		'Ver en junta de revisión',
		'View in review board',
		'Voir dans le comité de révision',
	],
	[
		'Ver las actividades utilizadas para calcular el pronóstico',
		'View activities used to calculate the forecast',
		'Voir les activités utilisées pour calculer les prévisions',
	],
	[
		'Ver turno en calendario',
		'View rotation in calendar',
		'Voir le tour dans le calendrier',
	],
	[
		'La programación próxima mantiene una trayectoria favorable.',
		'Upcoming programming remains on a favorable trajectory.',
		'La programmation à venir maintient une trajectoire favorable.',
	],
	[
		'La programación es viable, pero requiere seguimiento cercano.',
		'The programming is viable but requires close follow-up.',
		'La programmation est viable, mais nécessite un suivi rapproché.',
	],
	[
		'La programación próxima muestra señales que requieren intervención.',
		'Upcoming programming shows signs requiring intervention.',
		'La programmation à venir présente des signes nécessitant une intervention.',
	],
	[
		'Estimación explicable basada en estado, conflictos y anticipación de las tres actividades gestionadas más recientemente.',
		'Explainable estimate based on status, conflicts, and lead time from the three most recently managed activities.',
		'Estimation explicable fondée sur l’état, les conflits et l’anticipation des trois activités gérées le plus récemment.',
	],
	[
		'Cierres que requieren intervención',
		'Closures requiring intervention',
		'Clôtures nécessitant une intervention',
	],
	['Coordinación pendiente', 'Pending coordination', 'Coordination en attente'],
	[
		'Mejora de cumplimiento',
		'Completion improvement',
		'Amélioration de l’exécution',
	],
	[
		'Cumplimiento bajo presión',
		'Completion under pressure',
		'Exécution sous pression',
	],
	['Departamento destacado', 'Leading department', 'Département performant'],
	[
		'Anticipación de planificación',
		'Planning lead time',
		'Anticipation de la planification',
	],
	['Período en aprendizaje', 'Learning period', 'Période d’apprentissage'],
	[
		'A medida que se registren actividades aparecerán señales operativas accionables.',
		'Actionable operational signals will appear as activities are recorded.',
		'Des indicateurs opérationnels exploitables apparaîtront à mesure que les activités seront enregistrées.',
	],
	['Sin muestra', 'No sample', 'Aucun échantillon'],
	[
		'Fecha reservada provisionalmente',
		'Date provisionally reserved',
		'Date réservée provisoirement',
	],
	['Conflicto de calendario', 'Calendar conflict', 'Conflit de calendrier'],
	['Actividad aprobada', 'Activity approved', 'Activité approuvée'],
	['Actividad cancelada', 'Activity cancelled', 'Activité annulée'],
	['Actividad actualizada', 'Activity updated', 'Activité mise à jour'],
	[
		'Nueva solicitud de revisión',
		'New review request',
		'Nouvelle demande de révision',
	],
	[
		'Hay un conflicto que requiere revisión de la junta.',
		'A conflict requires board review.',
		'Un conflit nécessite l’examen du comité.',
	],
	['Nueva recomendación', 'New recommendation', 'Nouvelle recommandation'],
	['Decisión registrada', 'Decision recorded', 'Décision enregistrée'],
	[
		'Convocatoria a junta de revisión',
		'Review board invitation',
		'Convocation au comité de révision',
	],
	[
		'Junta de revisión actualizada',
		'Review board session updated',
		'Session du comité de révision mise à jour',
	],
	[
		'Junta de revisión cancelada',
		'Review board session cancelled',
		'Session du comité de révision annulée',
	],
	['Respuesta a convocatoria', 'Invitation response', 'Réponse à l’invitation'],
	[
		'Junta de revisión mañana',
		'Review board session tomorrow',
		'Session du comité demain',
	],
	[
		'Junta de revisión en 2 horas',
		'Review board session in 2 hours',
		'Session du comité dans 2 heures',
	],
	[
		'Junta de revisión en 1 hora',
		'Review board session in 1 hour',
		'Session du comité dans 1 heure',
	],
	[
		'Junta de revisión en 30 minutos',
		'Review board session in 30 minutes',
		'Session du comité dans 30 minutes',
	],
	[
		'Junta de revisión en 15 minutos',
		'Review board session in 15 minutes',
		'Session du comité dans 15 minutes',
	],
	[
		'Existe una alternativa',
		'An alternative is available',
		'Une alternative est disponible',
	],
	['Actividad en 7 días', 'Activity in 7 days', 'Activité dans 7 jours'],
	['Actividad mañana', 'Activity tomorrow', 'Activité demain'],
	[
		'Entrega pendiente de atención',
		'Delivery requiring attention',
		'Envoi nécessitant une attention',
	],
	[
		'Una alerta agotó sus reintentos y requiere revisión administrativa.',
		'An alert exhausted its retries and requires administrative review.',
		'Une alerte a épuisé ses tentatives et nécessite un examen administratif.',
	],
	[
		'Actualización de GestionChurch',
		'GestionChurch update',
		'Mise à jour de GestionChurch',
	],
	[
		'Hay una actualización en el calendario.',
		'There is a calendar update.',
		'Une mise à jour du calendrier est disponible.',
	],
	['vencidas', 'overdue', 'en retard'],
	['decisiones', 'decisions', 'décisions'],
	['esta semana', 'this week', 'cette semaine'],
	['salud operativa', 'operational health', 'santé opérationnelle'],
	[
		'Turno vigente / próximo',
		'Current / next rotation',
		'Tour actuel / prochain',
	],
	[
		'enlace(s) departamental(es) activo(s)',
		'active department assignment(s)',
		'liaison(s) départementale(s) active(s)',
	],
	['cierre confirmado', 'completion confirmed', 'clôture confirmée'],
	['ciclo aún abierto', 'cycle still open', 'cycle encore ouvert'],
	['requieren cierre', 'require closure', 'nécessitent une clôture'],
	['en calendario', 'on the calendar', 'au calendrier'],
	['esperando decisión', 'awaiting a decision', 'en attente de décision'],
	[
		'requieren coordinación',
		'require coordination',
		'nécessitent une coordination',
	],
	['Prioridad operativa', 'Operational priority', 'Priorité opérationnelle'],
	[
		'probabilidad operativa',
		'operational probability',
		'probabilité opérationnelle',
	],
	['Muestra', 'Sample', 'Échantillon'],
	['actividades', 'activities', 'activités'],
	['días', 'days', 'jours'],
	['Confianza', 'Confidence', 'Confiance'],
	['ALTA', 'HIGH', 'ÉLEVÉE'],
	['MEDIA', 'MEDIUM', 'MOYENNE'],
	['BAJA', 'LOW', 'FAIBLE'],
	['activas', 'active', 'actives'],
	['critical', 'critical', 'critique'],
	['pending', 'pending', 'en attente'],
	['warning', 'warning', 'attention'],
	['draft', 'draft', 'brouillon'],
	['Turno vigente', 'Current rotation', 'Tour actuel'],
	['Próximo turno', 'Next rotation', 'Prochain tour'],
	['Por asignar', 'Unassigned', 'À attribuer'],
	[
		'Crea la próxima cobertura semanal',
		'Create the next weekly coverage',
		'Créez la prochaine couverture hebdomadaire',
	],
	[
		'Predicador por confirmar',
		'Preacher to be confirmed',
		'Prédicateur à confirmer',
	],
	['Himno por confirmar', 'Hymn to be confirmed', 'Cantique à confirmer'],
	[
		'Los próximos programas aparecerán aquí.',
		'Upcoming programs will appear here.',
		'Les prochains programmes apparaîtront ici.',
	],
	[
		'actividades que requieren atención',
		'activities requiring attention',
		'activités nécessitant une intervention',
	],
	['actividades incompletas', 'incomplete activities', 'activités incomplètes'],
	['actividades pendientes', 'pending activities', 'activités en attente'],
	['conflictos abiertos', 'open conflicts', 'conflits ouverts'],
	['puntos', 'points', 'points'],
	[
		'Sin conflicto registrado',
		'No conflict recorded',
		'Aucun conflit enregistré',
	],
	[
		'Tuvo conflicto de coordinación',
		'Had a coordination conflict',
		'A connu un conflit de coordination',
	],
	['aprobada en', 'approved in', 'approuvée en'],
	['actividades de', 'activities for', 'activités de'],
	['Lugar por definir', 'Venue to be determined', 'Lieu à définir'],
	['Gobernanza', 'Governance', 'Gouvernance'],
	['Auditoría', 'Audit log', 'Journal d’audit'],
	[
		'Gobernanza y cumplimiento',
		'Governance and compliance',
		'Gouvernance et conformité',
	],
	['Registro activo', 'Active logging', 'Journalisation active'],
	['Trazabilidad inmutable', 'Immutable traceability', 'Traçabilité immuable'],
	['Centro de auditoría', 'Audit command center', 'Centre de contrôle d’audit'],
	[
		'Cada decisión y operación sensible queda asociada a su actor, resultado, recurso y correlación técnica.',
		'Every decision and sensitive operation is linked to its actor, outcome, resource, and technical correlation.',
		'Chaque décision et opération sensible est liée à son auteur, son résultat, sa ressource et sa corrélation technique.',
	],
	['Actualizar', 'Refresh', 'Actualiser'],
	['Exportar CSV', 'Export CSV', 'Exporter en CSV'],
	['Exportando…', 'Exporting…', 'Exportation…'],
	[
		'Auditoría no disponible',
		'Audit log unavailable',
		'Journal d’audit indisponible',
	],
	['Resumen de auditoría', 'Audit summary', 'Résumé de l’audit'],
	[
		'No fue posible cargar las iglesias.',
		'The churches could not be loaded.',
		'Impossible de charger les églises.',
	],
	[
		'No fue posible cargar la auditoría.',
		'The audit log could not be loaded.',
		'Impossible de charger le journal d’audit.',
	],
	[
		'No fue posible exportar la auditoría.',
		'The audit log could not be exported.',
		'Impossible d’exporter le journal d’audit.',
	],
	['Eventos registrados', 'Recorded events', 'Événements enregistrés'],
	['trazabilidad completa', 'complete traceability', 'traçabilité complète'],
	['Actividad de hoy', 'Today’s activity', 'Activité du jour'],
	['en el período actual', 'in the current period', 'dans la période actuelle'],
	['Excepciones', 'Exceptions', 'Exceptions'],
	['rechazos o fallos', 'rejections or failures', 'rejets ou échecs'],
	['Actores únicos', 'Unique actors', 'Acteurs uniques'],
	[
		'responsables identificados',
		'identified accountable users',
		'responsables identifiés',
	],
	['Buscar en auditoría', 'Search audit log', 'Rechercher dans l’audit'],
	[
		'Buscar actor, acción, recurso, ID o correlación…',
		'Search actor, action, resource, ID, or correlation…',
		'Rechercher un acteur, une action, une ressource, un ID ou une corrélation…',
	],
	['Limpiar búsqueda', 'Clear search', 'Effacer la recherche'],
	['Ámbito', 'Scope', 'Périmètre'],
	['Plataforma global', 'Global platform', 'Plateforme globale'],
	['Resultado', 'Outcome', 'Résultat'],
	['Todos', 'All', 'Tous'],
	['Correctos', 'Successful', 'Réussis'],
	['Rechazados', 'Rejected', 'Rejetés'],
	['Fallidos', 'Failed', 'Échoués'],
	['Acción', 'Action', 'Action'],
	['Todas', 'All', 'Toutes'],
	['Recurso', 'Resource', 'Ressource'],
	['Limpiar', 'Clear', 'Effacer'],
	[
		'No hay eventos para estos filtros',
		'No events match these filters',
		'Aucun événement ne correspond à ces filtres',
	],
	[
		'Ajusta la búsqueda o el ámbito para consultar la trazabilidad.',
		'Adjust the search or scope to review traceability.',
		'Ajustez la recherche ou le périmètre pour consulter la traçabilité.',
	],
	['Fecha y hora', 'Date and time', 'Date et heure'],
	['Actor', 'Actor', 'Auteur'],
	['Detalles', 'Details', 'Détails'],
	['Proceso del sistema', 'System process', 'Processus système'],
	['Sin identificador', 'No identifier', 'Sans identifiant'],
	['Correcto', 'Successful', 'Réussi'],
	['Rechazado', 'Rejected', 'Rejeté'],
	['Fallido', 'Failed', 'Échoué'],
	['Correlación', 'Correlation', 'Corrélation'],
	['No aplica', 'Not applicable', 'Sans objet'],
	['Motivo registrado', 'Recorded reason', 'Motif enregistré'],
	[
		'Sin observaciones adicionales',
		'No additional notes',
		'Aucune observation supplémentaire',
	],
	['Contexto seguro', 'Secure context', 'Contexte sécurisé'],
	['Página anterior', 'Previous page', 'Page précédente'],
	['Página siguiente', 'Next page', 'Page suivante'],
	[
		'Libro inmutable por iglesia',
		'Immutable ledger per church',
		'Registre immuable par église',
	],
	[
		'Los eventos no pueden editarse ni eliminarse y permanecen aislados en la base de datos de este tenant.',
		'Events cannot be edited or deleted and remain isolated in this tenant’s database.',
		'Les événements ne peuvent être ni modifiés ni supprimés et restent isolés dans la base de données de ce tenant.',
	],
	['Gobernanza global', 'Global governance', 'Gouvernance globale'],
	[
		'Auditoría de la plataforma',
		'Platform audit log',
		'Audit de la plateforme',
	],
	['Volver a iglesias', 'Back to churches', 'Retour aux églises'],
	[
		'Visibilidad global controlada',
		'Controlled global visibility',
		'Visibilité globale contrôlée',
	],
	[
		'El administrador global puede consultar la plataforma o seleccionar una iglesia. Las bases permanecen físicamente aisladas y nunca se mezclan.',
		'The global administrator can review the platform or select a church. Databases remain physically isolated and are never mixed.',
		'L’administrateur global peut consulter la plateforme ou sélectionner une église. Les bases restent physiquement isolées et ne sont jamais mélangées.',
	],
	['Inicio de sesión correcto', 'Successful sign-in', 'Connexion réussie'],
	['Inicio de sesión rechazado', 'Rejected sign-in', 'Connexion rejetée'],
	[
		'Restablecimiento solicitado',
		'Password reset requested',
		'Réinitialisation demandée',
	],
	[
		'Contraseña restablecida',
		'Password reset completed',
		'Mot de passe réinitialisé',
	],
	['Usuario creado', 'User created', 'Utilisateur créé'],
	['Usuario actualizado', 'User updated', 'Utilisateur mis à jour'],
	[
		'Cargo departamental asignado',
		'Department role assigned',
		'Rôle départemental attribué',
	],
	[
		'Cargo departamental retirado',
		'Department role removed',
		'Rôle départemental retiré',
	],
	['Auditoría consultada', 'Audit log viewed', 'Journal d’audit consulté'],
	['Auditoría exportada', 'Audit log exported', 'Journal d’audit exporté'],
	['Actividad creada', 'Activity created', 'Activité créée'],
	['Actividad actualizada', 'Activity updated', 'Activité mise à jour'],
	[
		'Actividad enviada a revisión',
		'Activity submitted for review',
		'Activité soumise à examen',
	],
	['Actividad aprobada', 'Activity approved', 'Activité approuvée'],
	['Actividad completada', 'Activity completed', 'Activité terminée'],
	['Actividad cancelada', 'Activity cancelled', 'Activité annulée'],
	['Nueva iniciativa', 'New initiative', 'Nouvelle initiative'],
	[
		'OPERACIÓN MISIONERA INTEGRADA',
		'INTEGRATED MISSION OPERATIONS',
		'OPÉRATIONS MISSIONNAIRES INTÉGRÉES',
	],
	[
		'Del plan a cada persona,',
		'From the plan to every person,',
		'Du plan à chaque personne,',
	],
	[
		'sin perder el seguimiento.',
		'without losing track.',
		'sans perdre le suivi.',
	],
	[
		'Estrategia, evangelismo, estudios bíblicos, grupos pequeños y equipo en una sola vista ejecutiva.',
		'Strategy, evangelism, Bible studies, small groups, and team in one executive view.',
		'Stratégie, évangélisation, études bibliques, petits groupes et équipe dans une seule vue exécutive.',
	],
	['SEÑAL MISIONERA', 'MISSION SIGNAL', 'SIGNAL MISSIONNAIRE'],
	['Ejecución', 'Execution', 'Exécution'],
	['Embudo de misión', 'Mission pipeline', 'Parcours missionnaire'],
	['Recorrido de personas', 'People journey', 'Parcours des personnes'],
	['Próximos compromisos', 'Upcoming commitments', 'Prochains engagements'],
	['Capacidad del equipo', 'Team capacity', 'Capacité de l’équipe'],
	[
		'Planificación estratégica',
		'Strategic planning',
		'Planification stratégique',
	],
	[
		'Conecta cada acción con un período, alcance, meta y responsable.',
		'Connect every action to a period, scope, goal, and owner.',
		'Reliez chaque action à une période, une portée, un objectif et un responsable.',
	],
	['Nuevo plan', 'New plan', 'Nouveau plan'],
	[
		'Acompañamiento individual',
		'Individual follow-up',
		'Accompagnement individuel',
	],
	[
		'Interesados y estudios bíblicos',
		'Interests and Bible studies',
		'Personnes intéressées et études bibliques',
	],
	[
		'Un historial continuo desde el primer contacto hasta el bautismo.',
		'A continuous history from first contact through baptism.',
		'Un historique continu du premier contact jusqu’au baptême.',
	],
	['Nuevo interesado', 'New interested person', 'Nouvelle personne intéressée'],
	['Estudio bíblico', 'Bible study', 'Étude biblique'],
	['En pausa', 'Paused', 'En pause'],
	['Bitácora de estudios', 'Study log', 'Journal des études'],
	[
		'Discipulado en comunidad',
		'Community discipleship',
		'Discipulat communautaire',
	],
	['Red de grupos pequeños', 'Small-group network', 'Réseau de petits groupes'],
	[
		'Liderazgo, horario, ubicación, miembros y metas visibles.',
		'Visible leadership, schedule, location, members, and goals.',
		'Direction, horaire, lieu, membres et objectifs visibles.',
	],
	['Nuevo grupo', 'New group', 'Nouveau groupe'],
	['Inspiración semanal', 'Weekly inspiration', 'Inspiration hebdomadaire'],
	[
		'Calendario de minutos misioneros',
		'Mission spotlight calendar',
		'Calendrier des minutes missionnaires',
	],
	[
		'Programa tema, material y presentador; el sistema notifica la asignación.',
		'Schedule the topic, material, and presenter; the system notifies the assignment.',
		'Planifiez le thème, le matériel et le présentateur ; le système notifie l’affectation.',
	],
	['Evangelismo público', 'Public evangelism', 'Évangélisation publique'],
	[
		'Campañas y decisiones',
		'Campaigns and decisions',
		'Campagnes et décisions',
	],
	[
		'Planifica el período y registra resultados que alimentan el tablero.',
		'Plan the period and record results that feed the dashboard.',
		'Planifiez la période et enregistrez les résultats qui alimentent le tableau de bord.',
	],
	['Nueva campaña', 'New campaign', 'Nouvelle campagne'],
	['Período', 'Period', 'Période'],
	['+ Registrar decisión', '+ Record decision', '+ Enregistrer une décision'],
	[
		'Equipo y distribución del trabajo',
		'Team and workload distribution',
		'Équipe et répartition du travail',
	],
	[
		'Los permisos provienen de los roles reales del departamento.',
		'Permissions come from actual department roles.',
		'Les autorisations proviennent des rôles réels du département.',
	],
	['Dirección', 'Director', 'Direction'],
	[
		'La información quedará aislada en la iglesia, enlazada al equipo y registrada en auditoría.',
		'Information will remain isolated within the church, linked to the team, and recorded in the audit log.',
		'Les informations resteront isolées au sein de l’église, liées à l’équipe et consignées dans le journal d’audit.',
	],
	['Visión', 'Vision', 'Vision'],
	[
		'Objetivos, uno por línea',
		'Objectives, one per line',
		'Objectifs, un par ligne',
	],
	[
		'Dirección departamental',
		'Department leadership',
		'Direction départementale',
	],
	['Nombre de la iniciativa', 'Initiative name', 'Nom de l’initiative'],
	['Iglesia local', 'Local church', 'Église locale'],
	[
		'Asociación Dominicana del Sureste',
		'Southeast Dominican Conference',
		'Fédération dominicaine du Sud-Est',
	],
	['Unión Dominicana', 'Dominican Union', 'Union dominicaine'],
	['Iglesia mundial', 'World church', 'Église mondiale'],
	['Capacitación', 'Training', 'Formation'],
	['Programa de iglesia', 'Church program', 'Programme d’église'],
	['Crítica', 'Critical', 'Critique'],
	['Meta numérica', 'Numeric goal', 'Objectif chiffré'],
	['Sin plan asociado', 'No linked plan', 'Aucun plan associé'],
	['Asignar después', 'Assign later', 'Attribuer plus tard'],
	['Sin asignar', 'Unassigned', 'Non attribué'],
	['Próximo seguimiento', 'Next follow-up', 'Prochain suivi'],
	[
		'La persona autorizó el registro de sus datos de contacto.',
		'The person authorized the recording of their contact information.',
		'La personne a autorisé l’enregistrement de ses coordonnées.',
	],
	['Lección o tema', 'Lesson or topic', 'Leçon ou thème'],
	['Próximo estudio', 'Next study', 'Prochaine étude'],
	['Nombre del grupo', 'Group name', 'Nom du groupe'],
	['Líder', 'Leader', 'Responsable'],
	['Sin asistente', 'No assistant', 'Sans adjoint'],
	['Día', 'Day', 'Jour'],
	['Meta de personas', 'People goal', 'Objectif de personnes'],
	['Nombre de la campaña', 'Campaign name', 'Nom de la campagne'],
	[
		'Sin iniciativa asociada',
		'No linked initiative',
		'Aucune initiative associée',
	],
	['Meta de decisiones', 'Decision goal', 'Objectif de décisions'],
	[
		'Misión y evangelismo',
		'Mission and evangelism',
		'Mission et évangélisation',
	],
	['Actualización confirmada', 'Update confirmed', 'Mise à jour confirmée'],
	[
		'Comprueba tu pertenencia al departamento o solicita acceso al administrador.',
		'Check your department membership or request access from the administrator.',
		'Vérifiez votre appartenance au département ou demandez l’accès à l’administrateur.',
	],
	['Áreas de trabajo', 'Work areas', 'Domaines de travail'],
	[
		'Aún no hay iniciativas',
		'There are no initiatives yet',
		'Aucune initiative pour le moment',
	],
	[
		'Crea la primera iniciativa para activar el centro de misión.',
		'Create the first initiative to activate the mission center.',
		'Créez la première initiative pour activer le centre missionnaire.',
	],
	[
		'Crea el plan del período',
		'Create the period plan',
		'Créez le plan de la période',
	],
	[
		'Define visión, objetivos y responsable para alinear todas las iniciativas.',
		'Define the vision, objectives, and owner to align every initiative.',
		'Définissez la vision, les objectifs et le responsable afin d’aligner toutes les initiatives.',
	],
	[
		'Buscar interesados',
		'Search interested people',
		'Rechercher des personnes intéressées',
	],
	[
		'Buscar por nombre, etapa, fuente o responsable…',
		'Search by name, stage, source, or owner…',
		'Rechercher par nom, étape, source ou responsable…',
	],
	[
		'Sin grupos pequeños registrados',
		'No small groups registered',
		'Aucun petit groupe enregistré',
	],
	[
		'Crea la primera célula de discipulado y asigna su liderazgo.',
		'Create the first discipleship group and assign its leadership.',
		'Créez le premier groupe de discipulat et attribuez sa direction.',
	],
	[
		'Planifica el próximo ciclo evangelístico',
		'Plan the next evangelistic cycle',
		'Planifiez le prochain cycle d’évangélisation',
	],
	[
		'Registra campaña, meta, lugar, evangelista y período.',
		'Record the campaign, goal, location, evangelist, and period.',
		'Enregistrez la campagne, l’objectif, le lieu, l’évangéliste et la période.',
	],
	[
		'Formulario de Ministerios Personales',
		'Personal Ministries form',
		'Formulaire des Ministères personnels',
	],
	[
		'Describe el resultado espiritual esperado…',
		'Describe the expected spiritual outcome…',
		'Décrivez le résultat spirituel attendu…',
	],
	[
		'Visitante, campaña, amigo…',
		'Visitor, campaign, friend…',
		'Visiteur, campagne, ami…',
	],
	['Centro de misión', 'Mission center', 'Centre missionnaire'],
	['Grupos pequeños', 'Small groups', 'Petits groupes'],
	['En estudio bíblico', 'In Bible study', 'En étude biblique'],
	[
		'Preparándose para bautismo',
		'Preparing for baptism',
		'En préparation au baptême',
	],
	['Subdirección', 'Assistant director', 'Direction adjointe'],
	['Secretaría', 'Secretary', 'Secrétariat'],
	['Colaboración', 'Contributor', 'Collaboration'],
	[
		'No se pudo completar la acción.',
		'The action could not be completed.',
		'L’action n’a pas pu être effectuée.',
	],
	[
		'Plan estratégico creado y activado.',
		'Strategic plan created and activated.',
		'Plan stratégique créé et activé.',
	],
	[
		'Interesado registrado con trazabilidad.',
		'Interested person recorded with traceability.',
		'Personne intéressée enregistrée avec traçabilité.',
	],
	[
		'Estudio bíblico registrado.',
		'Bible study recorded.',
		'Étude biblique enregistrée.',
	],
	['Grupo pequeño activado.', 'Small group activated.', 'Petit groupe activé.'],
	[
		'Campaña evangelística planificada.',
		'Evangelistic campaign planned.',
		'Campagne d’évangélisation planifiée.',
	],
	[
		'Ejecución saludable y bajo control',
		'Healthy execution under control',
		'Exécution saine et maîtrisée',
	],
	[
		'Interesados en seguimiento',
		'Interested people in follow-up',
		'Personnes intéressées en suivi',
	],
	[
		'Visión estratégica pendiente de completar.',
		'Strategic vision awaiting completion.',
		'Vision stratégique à compléter.',
	],
	[
		'Sin responsable asignado',
		'No assigned owner',
		'Aucun responsable attribué',
	],
	[
		'Seguimiento por programar',
		'Follow-up to be scheduled',
		'Suivi à programmer',
	],
	['Ubicación por definir', 'Location to be defined', 'Lieu à définir'],
	['Tema pendiente', 'Topic pending', 'Thème en attente'],
	['Tema por definir', 'Topic to be defined', 'Thème à définir'],
	[
		'Resultado de campaña actualizado.',
		'Campaign result updated.',
		'Résultat de la campagne mis à jour.',
	],
	[
		'Operación y seguimiento',
		'Operations and follow-up',
		'Opérations et suivi',
	],
	['Nuevo plan estratégico', 'New strategic plan', 'Nouveau plan stratégique'],
	[
		'Nueva iniciativa misionera',
		'New mission initiative',
		'Nouvelle initiative missionnaire',
	],
	[
		'Registrar estudio bíblico',
		'Record Bible study',
		'Enregistrer une étude biblique',
	],
	['Crear grupo pequeño', 'Create small group', 'Créer un petit groupe'],
	[
		'Planificar campaña evangelística',
		'Plan evangelistic campaign',
		'Planifier une campagne d’évangélisation',
	],
	['Guardar y enlazar', 'Save and link', 'Enregistrer et relier'],
	['Presupuesto', 'Budget', 'Budget'],
	['Presupuesto disponible', 'Available budget', 'Budget disponible'],
	['Gobierno financiero', 'Financial governance', 'Gouvernance financière'],
	['Presupuesto por actividad', 'Budget by activity', 'Budget par activité'],
	[
		'Planifica, compromete y ejecuta recursos con trazabilidad completa.',
		'Plan, commit, and execute resources with complete traceability.',
		'Planifiez, engagez et exécutez les ressources avec une traçabilité complète.',
	],
	['Ajustar presupuesto', 'Adjust budget', 'Ajuster le budget'],
	['Nueva partida', 'New entry', 'Nouvelle écriture'],
	['Presupuesto aprobado', 'Approved budget', 'Budget approuvé'],
	['Comprometido', 'Committed', 'Engagé'],
	['Pagado', 'Paid', 'Payé'],
	['Disponible', 'Available', 'Disponible'],
	[
		'Revisa los compromisos antes de autorizar nuevos gastos.',
		'Review commitments before authorizing new expenses.',
		'Examinez les engagements avant d’autoriser de nouvelles dépenses.',
	],
	['Actividades presupuestadas', 'Budgeted activities', 'Activités budgétées'],
	['Actividades', 'Activities', 'Activités'],
	['Actividad seleccionada', 'Selected activity', 'Activité sélectionnée'],
	['uso global', 'overall utilization', 'utilisation globale'],
	['Aprobado', 'Approved', 'Approuvé'],
	['Proyección', 'Forecast', 'Prévision'],
	['Partidas presupuestarias', 'Budget entries', 'Écritures budgétaires'],
	['Fecha y categoría', 'Date and category', 'Date et catégorie'],
	['Detalle', 'Details', 'Détail'],
	['Monto', 'Amount', 'Montant'],
	['Acciones', 'Actions', 'Actions'],
	['Sin proveedor', 'No vendor', 'Sans fournisseur'],
	['Pagar', 'Pay', 'Payer'],
	['Aprobar', 'Approve', 'Approuver'],
	['Anular', 'Void', 'Annuler'],
	[
		'Sin movimientos presupuestarios',
		'No budget transactions',
		'Aucun mouvement budgétaire',
	],
	[
		'Registra el primer compromiso, gasto o ingreso de esta actividad.',
		'Record the first commitment, expense, or income for this activity.',
		'Enregistrez le premier engagement, la première dépense ou la première recette de cette activité.',
	],
	['Crea una iniciativa', 'Create an initiative', 'Créez une initiative'],
	[
		'Cada presupuesto se enlaza a una actividad misionera para conservar contexto y trazabilidad.',
		'Each budget is linked to a mission activity to preserve context and traceability.',
		'Chaque budget est lié à une activité missionnaire afin de préserver le contexte et la traçabilité.',
	],
	[
		'Ajustar presupuesto aprobado',
		'Adjust approved budget',
		'Ajuster le budget approuvé',
	],
	[
		'Registrar partida presupuestaria',
		'Record budget entry',
		'Enregistrer une écriture budgétaire',
	],
	[
		'Define el techo autorizado para controlar su ejecución.',
		'Define the authorized ceiling to control execution.',
		'Définissez le plafond autorisé pour contrôler l’exécution.',
	],
	['Moneda', 'Currency', 'Devise'],
	['Tipo de movimiento', 'Transaction type', 'Type de mouvement'],
	['Compromiso', 'Commitment', 'Engagement'],
	['Gasto', 'Expense', 'Dépense'],
	['Ingreso', 'Income', 'Recette'],
	['Planificado', 'Planned', 'Planifié'],
	['Categoría', 'Category', 'Catégorie'],
	[
		'Alimentación, transporte, materiales…',
		'Food, transportation, materials…',
		'Alimentation, transport, matériel…',
	],
	[
		'Proveedor o beneficiario',
		'Vendor or beneficiary',
		'Fournisseur ou bénéficiaire',
	],
	[
		'Propósito específico del movimiento',
		'Specific purpose of the transaction',
		'Objet précis du mouvement',
	],
	[
		'Referencia o comprobante',
		'Reference or receipt',
		'Référence ou justificatif',
	],
	['Notas de control', 'Control notes', 'Notes de contrôle'],
	[
		'Presupuesto aprobado actualizado.',
		'Approved budget updated.',
		'Budget approuvé mis à jour.',
	],
	[
		'Partida presupuestaria registrada.',
		'Budget entry recorded.',
		'Écriture budgétaire enregistrée.',
	],
	[
		'Partida marcada como pagada.',
		'Entry marked as paid.',
		'Écriture marquée comme payée.',
	],
	['Partida aprobada.', 'Entry approved.', 'Écriture approuvée.'],
	[
		'Partida anulada con trazabilidad.',
		'Entry voided with traceability.',
		'Écriture annulée avec traçabilité.',
	],
	[
		'La moneda queda bloqueada después del primer movimiento presupuestario.',
		'The currency is locked after the first budget transaction.',
		'La devise est verrouillée après le premier mouvement budgétaire.',
	],
	['DOP · Peso dominicano', 'DOP · Dominican peso', 'DOP · Peso dominicain'],
	['USD · Dólar estadounidense', 'USD · US dollar', 'USD · Dollar américain'],
	['Dirección del servicio', 'Service direction', 'Direction du service'],
	[
		'Coordina quién dirige, quién participa y cuándo ocurre cada parte del culto.',
		'Coordinate who leads, who participates, and when each part of the service takes place.',
		'Coordonnez la direction, les participants et le déroulement de chaque partie du service.',
	],
	['Crear plantilla', 'Create template', 'Créer un modèle'],
	['En plataforma', 'On platform', 'Sur l’estrade'],
	['Equipo de plataforma', 'Platform team', 'Équipe de l’estrade'],
	['Seleccionar plantilla…', 'Select template…', 'Sélectionner un modèle…'],
	['Dirección operativa', 'Service operations', 'Direction opérationnelle'],
	[
		'Diseñar plataforma y minuto a minuto',
		'Design platform and minute-by-minute order',
		'Concevoir l’estrade et le déroulé minute par minute',
	],
	['1. Equipo de plataforma', '1. Platform team', '1. Équipe de l’estrade'],
	[
		'Agrega una o varias personas y define quién dirige.',
		'Add one or more people and designate who leads.',
		'Ajoutez une ou plusieurs personnes et désignez la personne responsable.',
	],
	['Seleccionar usuario…', 'Select user…', 'Sélectionner un utilisateur…'],
	['Agregar invitado', 'Add guest', 'Ajouter un invité'],
	['2. Orden del culto', '2. Order of service', '2. Déroulement du service'],
	[
		'Las horas se recalculan automáticamente al cambiar el orden o la duración.',
		'Times are recalculated automatically when the order or duration changes.',
		'Les heures sont recalculées automatiquement lorsque l’ordre ou la durée change.',
	],
	['Duración', 'Duration', 'Durée'],
	['Parte del servicio', 'Part of the service', 'Partie du service'],
	['Plataforma del culto', 'Worship service platform', 'Équipe et déroulement du culte'],
	['Agregar participación', 'Add participation', 'Ajouter une participation'],
	[
		'Guardar orden como plantilla',
		'Save order as template',
		'Enregistrer le déroulé comme modèle',
	],
	[
		'Crear plantilla de culto',
		'Create worship service template',
		'Créer un modèle de service',
	],
	[
		'Define una estructura propia. Podrás aplicarla a futuros cultos y ajustar cada detalle antes de guardar.',
		'Define your own structure. You can apply it to future services and adjust every detail before saving.',
		'Définissez votre propre structure. Vous pourrez l’appliquer aux prochains services et ajuster chaque détail avant l’enregistrement.',
	],
	['Nombre de la plantilla', 'Template name', 'Nom du modèle'],
	['Agregar parte', 'Add section', 'Ajouter une partie'],
	['Selecciona un culto', 'Select a service', 'Sélectionnez un service'],
	[
		'Elige un programa para diseñar su plataforma y orden de servicio.',
		'Choose a program to design its platform and order of service.',
		'Choisissez un programme pour concevoir son estrade et son déroulement.',
	],
	[
		'El orden aún no está definido',
		'The order is not defined yet',
		'Le déroulement n’est pas encore défini',
	],
	[
		'Aplica una plantilla base o crea una propia para comenzar.',
		'Apply a base template or create your own to begin.',
		'Appliquez un modèle de base ou créez le vôtre pour commencer.',
	],
	['Plantilla para aplicar', 'Template to apply', 'Modèle à appliquer'],
	[
		'Invitado o participante sin usuario',
		'Guest or participant without an account',
		'Invité ou participant sans compte',
	],
	['Quitar de plataforma', 'Remove from platform', 'Retirer de l’estrade'],
	['Nombre de quien participa', 'Participant name', 'Nom du participant'],
	[
		'Micrófono, transición, pista o detalle operativo',
		'Microphone, transition, track, or operational detail',
		'Microphone, transition, piste ou détail opérationnel',
	],
	['Quitar participación', 'Remove participation', 'Retirer la participation'],
	['Invocación', 'Invocation', 'Invocation'],
	['Oración', 'Prayer', 'Prière'],
	['Música especial', 'Special music', 'Musique spéciale'],
	['Bendición', 'Benediction', 'Bénédiction'],
	['Participación especial', 'Special participation', 'Participation spéciale'],
	[
		'No fue posible cargar la plataforma del culto.',
		'The service platform could not be loaded.',
		'Impossible de charger l’estrade du service.',
	],
	[
		'Plantilla aplicada. Ahora asigna cada participación y confirma el equipo de plataforma.',
		'Template applied. Now assign each participation and confirm the platform team.',
		'Modèle appliqué. Attribuez maintenant chaque participation et confirmez l’équipe de l’estrade.',
	],
	[
		'No fue posible aplicar la plantilla.',
		'The template could not be applied.',
		'Impossible d’appliquer le modèle.',
	],
	['Apoyo de plataforma', 'Platform support', 'Soutien de l’estrade'],
	['Director de plataforma', 'Platform director', 'Responsable de l’estrade'],
	['Nueva participación', 'New participation', 'Nouvelle participation'],
	[
		'No fue posible guardar la plataforma.',
		'The platform could not be saved.',
		'Impossible d’enregistrer l’estrade.',
	],
	[
		'Plantilla creada por el equipo de Ancianos para reutilizar este orden de culto.',
		'Template created by the Elders team to reuse this order of service.',
		'Modèle créé par l’équipe des Anciens pour réutiliser ce déroulement de service.',
	],
	[
		'Plantilla personalizada creada. Ya está disponible para el equipo de Ancianos.',
		'Custom template created. It is now available to the Elders team.',
		'Modèle personnalisé créé. Il est maintenant disponible pour l’équipe des Anciens.',
	],
	[
		'No fue posible crear la plantilla.',
		'The template could not be created.',
		'Impossible de créer le modèle.',
	],
	[
		'Participante por asignar',
		'Participant to be assigned',
		'Participant à attribuer',
	],
	['Diseñar plataforma', 'Design platform', 'Concevoir l’estrade'],
	['Guardar plataforma', 'Save platform', 'Enregistrer l’estrade'],

	// Ministerio de la Mujer
	['Ministerio de la Mujer', 'Women’s Ministries', 'Ministère des Femmes'],
	[
		'Cuidado, crecimiento y misión',
		'Care, growth, and mission',
		'Accompagnement, croissance et mission',
	],
	['Departamento pendiente', 'Department pending', 'Département en attente'],
	[
		'Crea o activa “Ministerio de la Mujer” en Departamentos para enlazar actividades y roles.',
		'Create or activate Women’s Ministries under Departments to connect activities and roles.',
		'Créez ou activez le Ministère des Femmes dans Départements afin de relier les activités et les rôles.',
	],
	[
		'Coordinación con propósito',
		'Purposeful coordination',
		'Coordination porteuse de sens',
	],
	[
		'Cada mujer vista, incluida y acompañada.',
		'Every woman seen, included, and supported.',
		'Chaque femme reconnue, incluse et accompagnée.',
	],
	[
		'Planificación, presupuesto, participación, retiro espiritual y seguimiento en un solo centro de misión.',
		'Planning, budgeting, participation, spiritual retreat, and follow-up in one mission center.',
		'Planification, budget, participation, retraite spirituelle et suivi réunis dans un seul centre de mission.',
	],
	[
		'Secciones del Ministerio de la Mujer',
		'Women’s Ministries sections',
		'Sections du Ministère des Femmes',
	],
	['Necesitan conexión', 'Need connection', 'À accompagner'],
	[
		'Todas tienen un lugar',
		'There is a place for everyone',
		'Chacune a sa place',
	],
	[
		'Segmentación para enfocar programas sin excluir ninguna edad.',
		'Segmentation to focus programs without excluding any age group.',
		'Une segmentation pour cibler les programmes sans exclure aucun âge.',
	],
	[
		'Oportunidades de inclusión',
		'Inclusion opportunities',
		'Possibilités d’inclusion',
	],
	[
		'Todas están conectadas',
		'Everyone is connected',
		'Toutes sont accompagnées',
	],
	[
		'No hay señales de participación pendientes de seguimiento.',
		'There are no participation signals awaiting follow-up.',
		'Aucun signal de participation ne nécessite de suivi.',
	],
	['Abrir calendario', 'Open calendar', 'Ouvrir le calendrier'],
	[
		'Registrar participación',
		'Record participation',
		'Enregistrer la participation',
	],
	['Completar actividad', 'Complete activity', 'Terminer l’activité'],
	['Planificación lista', 'Planning is ready', 'Planification prête'],
	[
		'Crea la primera actividad del Ministerio de la Mujer.',
		'Create the first Women’s Ministries activity.',
		'Créez la première activité du Ministère des Femmes.',
	],
	[
		'Selecciona una actividad',
		'Select an activity',
		'Sélectionnez une activité',
	],
	[
		'Consulta presupuesto, ejecución y participación.',
		'Review budget, execution, and participation.',
		'Consultez le budget, l’exécution et la participation.',
	],
	['Roster de mujeres', 'Women’s roster', 'Registre des femmes'],
	[
		'Perfiles vinculados al tenant y visibles solo para liderazgo autorizado.',
		'Profiles linked to this tenant and visible only to authorized leaders.',
		'Profils liés à ce tenant et visibles uniquement par les responsables autorisés.',
	],
	['Agregar mujer', 'Add woman', 'Ajouter une femme'],
	['Buscar en roster', 'Search roster', 'Rechercher dans le registre'],
	[
		'Buscar nombre, correo o teléfono…',
		'Search by name, email, or phone…',
		'Rechercher par nom, courriel ou téléphone…',
	],
	['Filtrar por edad', 'Filter by age', 'Filtrer par âge'],
	['Todas las edades', 'All ages', 'Tous les âges'],
	[
		'No hay perfiles en este segmento',
		'No profiles in this segment',
		'Aucun profil dans ce segment',
	],
	[
		'Agrega mujeres al roster o selecciona otro rango de edad.',
		'Add women to the roster or select another age range.',
		'Ajoutez des femmes au registre ou sélectionnez une autre tranche d’âge.',
	],
	['Nuevo retiro', 'New retreat', 'Nouvelle retraite'],
	[
		'Crea el retiro anual',
		'Create the annual retreat',
		'Créez la retraite annuelle',
	],
	[
		'Controla resort, cupos, participantes, pagos y logística.',
		'Manage the resort, capacity, participants, payments, and logistics.',
		'Gérez le centre de villégiature, les places, les participantes, les paiements et la logistique.',
	],
	['Por cobrar', 'Outstanding', 'À recevoir'],
	[
		'Acompañamiento intencional',
		'Intentional care',
		'Accompagnement intentionnel',
	],
	['Inclusión y seguimiento', 'Inclusion and follow-up', 'Inclusion et suivi'],
	[
		'Convierte las señales de baja participación en acciones concretas de cuidado.',
		'Turn low-participation signals into concrete care actions.',
		'Transformez les signes de faible participation en actions concrètes d’accompagnement.',
	],
	['Nuevo seguimiento', 'New follow-up', 'Nouveau suivi'],
	['Seguimiento al día', 'Follow-up is up to date', 'Suivi à jour'],
	[
		'No hay acciones de inclusión pendientes.',
		'There are no pending inclusion actions.',
		'Aucune action d’inclusion n’est en attente.',
	],
	[
		'Enlaza un usuario existente o registra un perfil ministerial.',
		'Link an existing user or create a ministry profile.',
		'Liez un utilisateur existant ou créez un profil ministériel.',
	],
	['Usuario existente', 'Existing user', 'Utilisateur existant'],
	['Perfil sin usuario', 'Profile without an account', 'Profil sans compte'],
	['Fecha de nacimiento', 'Date of birth', 'Date de naissance'],
	['Nota de inclusión', 'Inclusion note', 'Note d’inclusion'],
	[
		'Oración, salud, mentoría…',
		'Prayer, health, mentoring…',
		'Prière, santé, mentorat…',
	],
	['Planificación conectada', 'Connected planning', 'Planification connectée'],
	[
		'Se creará en el calendario central para validar disponibilidad y conflictos.',
		'It will be created in the central calendar to validate availability and conflicts.',
		'Elle sera créée dans le calendrier central afin de vérifier les disponibilités et les conflits.',
	],
	['Dirección del ministerio', 'Ministry leadership', 'Direction du ministère'],
	['Rangos de edad enfocados', 'Target age ranges', 'Tranches d’âge ciblées'],
	['Medición de inclusión', 'Inclusion measurement', 'Mesure de l’inclusion'],
	['Asistió', 'Attended', 'A participé'],
	['No participará', 'Will not attend', 'Ne participera pas'],
	['No asistió', 'Did not attend', 'N’a pas participé'],
	[
		'Crear retiro espiritual',
		'Create spiritual retreat',
		'Créer une retraite spirituelle',
	],
	['Costo por persona', 'Cost per person', 'Coût par personne'],
	['Fecha límite de depósito', 'Deposit deadline', 'Date limite de l’acompte'],
	['Inscribir al retiro', 'Register for the retreat', 'Inscrire à la retraite'],
	[
		'Participantes y logística',
		'Participants and logistics',
		'Participantes et logistique',
	],
	['Lista de espera', 'Waitlist', 'Liste d’attente'],
	['Habitación', 'Room', 'Chambre'],
	['Tesorería del retiro', 'Retreat treasury', 'Trésorerie de la retraite'],
	['Método', 'Method', 'Méthode'],
	['Crear seguimiento', 'Create follow-up', 'Créer un suivi'],
	['Cuidado e inclusión', 'Care and inclusion', 'Accompagnement et inclusion'],
	[
		'Invitar, escuchar, acompañar o integrar',
		'Invite, listen, support, or integrate',
		'Inviter, écouter, accompagner ou intégrer',
	],
	['Fecha de seguimiento', 'Follow-up date', 'Date de suivi'],
	['Actividad relacionada', 'Related activity', 'Activité associée'],
	['Menores de 18', 'Under 18', 'Moins de 18 ans'],
	['18–25 años', 'Ages 18–25', '18–25 ans'],
	['26–39 años', 'Ages 26–39', '26–39 ans'],
	['40–59 años', 'Ages 40–59', '40–59 ans'],
	['60 años o más', 'Age 60 or older', '60 ans ou plus'],
	['Edad por completar', 'Age not provided', 'Âge à renseigner'],
	['En ejecución', 'In progress', 'En cours'],
	['Pendiente de pago', 'Payment pending', 'Paiement en attente'],
	[
		'Mujeres de la iglesia y comunidad',
		'Women from the church and community',
		'Femmes de l’église et de la communauté',
	],
	['Fecha principal', 'Primary date', 'Date principale'],
	[
		'Actividad planificada, presupuestada y enlazada al calendario central.',
		'Activity planned, budgeted, and linked to the central calendar.',
		'Activité planifiée, budgétée et reliée au calendrier central.',
	],
	[
		'Movimiento presupuestario registrado con trazabilidad.',
		'Budget transaction recorded with traceability.',
		'Mouvement budgétaire enregistré avec traçabilité.',
	],
	[
		'Participación actualizada.',
		'Participation updated.',
		'Participation mise à jour.',
	],
	[
		'Actividad completada y lista para evaluación de participación.',
		'Activity completed and ready for participation review.',
		'Activité terminée et prête pour l’évaluation de la participation.',
	],
	[
		'Actividad marcada como completada.',
		'Activity marked as completed.',
		'Activité marquée comme terminée.',
	],
	[
		'Retiro anual creado y listo para gestionar inscripciones.',
		'Annual retreat created and ready for registration management.',
		'Retraite annuelle créée et prête pour la gestion des inscriptions.',
	],
	[
		'Participante agregada al retiro.',
		'Participant added to the retreat.',
		'Participante ajoutée à la retraite.',
	],
	[
		'Contacto de inclusión y acompañamiento',
		'Inclusion and care contact',
		'Contact d’inclusion et d’accompagnement',
	],
	[
		'Responsable por asignar',
		'Owner to be assigned',
		'Responsable à attribuer',
	],
	['Sin responsable', 'Unassigned', 'Sans responsable'],
	['Cumpleaños próximos', 'Upcoming birthdays', 'Anniversaires à venir'],
	['Celebrar y acompañar', 'Celebrate and care', 'Célébrer et accompagner'],
	[
		'Cumpleaños de los próximos 30 días',
		'Birthdays in the next 30 days',
		'Anniversaires des 30 prochains jours',
	],
	[
		'La directora y su directiva reciben avisos sin duplicados: uno durante la semana previa y otro el día del cumpleaños.',
		'The director and her leadership team receive deduplicated alerts: one during the preceding week and another on the birthday.',
		'La directrice et son équipe dirigeante reçoivent des alertes sans doublon : une pendant la semaine précédente et une autre le jour de l’anniversaire.',
	],
	[
		'Sin cumpleaños próximos',
		'No upcoming birthdays',
		'Aucun anniversaire à venir',
	],
	[
		'No hay cumpleaños registrados para los próximos 30 días.',
		'No birthdays are recorded for the next 30 days.',
		'Aucun anniversaire n’est enregistré pour les 30 prochains jours.',
	],
	['DÍAS', 'DAYS', 'JOURS'],
	['Cumpleaños de hoy', 'Birthday today', 'Anniversaire aujourd’hui'],
	['Padrón de iglesia', 'Church roster', 'Registre de l’église'],
	[
		'Administración del tenant',
		'Tenant administration',
		'Administration du tenant',
	],
	['Importar padrón', 'Import roster', 'Importer le registre'],
	[
		'Fuente maestra del tenant',
		'Tenant master source',
		'Source principale du tenant',
	],
	[
		'Una iglesia conocida, cuidada y conectada.',
		'A church that is known, cared for, and connected.',
		'Une église connue, accompagnée et connectée.',
	],
	[
		'Importa el padrón una sola vez y mantén sincronizados cumpleaños, edades y perfiles ministeriales sin duplicar información.',
		'Import the roster once and keep birthdays, ages, and ministry profiles synchronized without duplicating data.',
		'Importez le registre une seule fois et synchronisez les anniversaires, les âges et les profils ministériels sans dupliquer les données.',
	],
	['Aislamiento por iglesia', 'Church-level isolation', 'Isolement par église'],
	[
		'Solo los administradores autorizados de este tenant pueden gestionar el padrón.',
		'Only authorized administrators in this tenant can manage the roster.',
		'Seuls les administrateurs autorisés de ce tenant peuvent gérer le registre.',
	],
	['personas activas', 'active people', 'personnes actives'],
	['con fotografía', 'with a photo', 'avec photo'],
	['Resumen del padrón', 'Roster summary', 'Résumé du registre'],
	['Padrón activo', 'Active roster', 'Registre actif'],
	['Mujeres sincronizadas', 'Women synchronized', 'Femmes synchronisées'],
	[
		'Cumpleaños en 30 días',
		'Birthdays in 30 days',
		'Anniversaires dans les 30 jours',
	],
	['Perfiles con foto', 'Profiles with a photo', 'Profils avec photo'],
	['Importación controlada', 'Controlled import', 'Importation contrôlée'],
	['Centro de padrón', 'Roster center', 'Centre du registre'],
	[
		'Descarga el formato oficial, valida los datos y confirma únicamente las filas correctas.',
		'Download the official format, validate the data, and confirm only correct rows.',
		'Téléchargez le format officiel, validez les données et confirmez uniquement les lignes correctes.',
	],
	['Descargar plantilla', 'Download template', 'Télécharger le modèle'],
	['Cargar información', 'Upload data', 'Téléverser les données'],
	['Flujo de importación', 'Import workflow', 'Processus d’importation'],
	['Descarga', 'Download', 'Téléchargement'],
	['Formato oficial', 'Official format', 'Format officiel'],
	['Previsualiza', 'Preview', 'Prévisualisation'],
	['Errores y avisos', 'Errors and warnings', 'Erreurs et avertissements'],
	['Confirma', 'Confirm', 'Confirmation'],
	[
		'Sincronización segura',
		'Secure synchronization',
		'Synchronisation sécurisée',
	],
	[
		'Directorio visual protegido',
		'Protected visual directory',
		'Annuaire visuel protégé',
	],
	['Personas de la iglesia', 'People in the church', 'Personnes de l’église'],
	['Buscar en el padrón', 'Search the roster', 'Rechercher dans le registre'],
	[
		'Código, nombre, correo o teléfono…',
		'Code, name, email, or phone…',
		'Code, nom, e-mail ou téléphone…',
	],
	['Filtrar por sexo', 'Filter by sex', 'Filtrer par sexe'],
	['Todas las personas', 'Everyone', 'Toutes les personnes'],
	['Mujeres', 'Women', 'Femmes'],
	['Hombres', 'Men', 'Hommes'],
	['Sin especificar', 'Unspecified', 'Non précisé'],
	['Filtrar por estado', 'Filter by status', 'Filtrer par statut'],
	['Activos', 'Active', 'Actifs'],
	['Todos los estados', 'All statuses', 'Tous les statuts'],
	['Miembros', 'Members', 'Membres'],
	['Visitantes', 'Visitors', 'Visiteurs'],
	['Inactivos', 'Inactive', 'Inactifs'],
	['Trasladados', 'Transferred', 'Transférés'],
	[
		'Sin contacto registrado',
		'No contact recorded',
		'Aucun contact enregistré',
	],
	[
		'No hay perfiles con estos filtros',
		'No profiles match these filters',
		'Aucun profil ne correspond à ces filtres',
	],
	[
		'Ajusta la búsqueda o importa la plantilla oficial del padrón.',
		'Adjust the search or import the official roster template.',
		'Ajustez la recherche ou importez le modèle officiel du registre.',
	],
	['Trazabilidad', 'Traceability', 'Traçabilité'],
	['Importaciones recientes', 'Recent imports', 'Importations récentes'],
	['Completada', 'Completed', 'Terminée'],
	['Previsualizada', 'Previewed', 'Prévisualisée'],
	['Importación segura', 'Secure import', 'Importation sécurisée'],
	[
		'Cargar padrón de iglesia',
		'Upload church roster',
		'Téléverser le registre de l’église',
	],
	[
		'El archivo se valida primero. Ninguna persona se guarda hasta que revises la previsualización y confirmes.',
		'The file is validated first. No person is saved until you review the preview and confirm.',
		'Le fichier est d’abord validé. Aucune personne n’est enregistrée avant votre vérification et confirmation.',
	],
	['¿Primera importación?', 'First import?', 'Première importation ?'],
	[
		'Usa el formato oficial con catálogos, fechas y campos requeridos.',
		'Use the official format with catalogs, dates, and required fields.',
		'Utilisez le format officiel avec les listes, les dates et les champs obligatoires.',
	],
	[
		'Selecciona o arrastra tu archivo',
		'Select or drag your file',
		'Sélectionnez ou déposez votre fichier',
	],
	[
		'XLSX o CSV · máximo 8 MB · hasta 5,000 personas',
		'XLSX or CSV · 8 MB maximum · up to 5,000 people',
		'XLSX ou CSV · 8 Mo maximum · jusqu’à 5 000 personnes',
	],
	['Aislado por tenant', 'Tenant isolated', 'Isolé par tenant'],
	[
		'Sin duplicados por código',
		'No duplicates by code',
		'Aucun doublon par code',
	],
	[
		'Sincroniza Ministerio de la Mujer',
		'Synchronizes Women’s Ministries',
		'Synchronise le Ministère de la Femme',
	],
	['Analizando archivo…', 'Analyzing file…', 'Analyse du fichier…'],
	[
		'Previsualizar importación',
		'Preview import',
		'Prévisualiser l’importation',
	],
	['listas para importar', 'ready to import', 'prêtes à importer'],
	['con advertencias', 'with warnings', 'avec avertissements'],
	['excluidas por error', 'excluded due to errors', 'exclues pour erreur'],
	[
		'Las filas inválidas no se guardarán.',
		'Invalid rows will not be saved.',
		'Les lignes non valides ne seront pas enregistrées.',
	],
	[
		'Puedes importar las filas válidas ahora o corregir el archivo y volver a cargarlo.',
		'You can import valid rows now or correct the file and upload it again.',
		'Vous pouvez importer les lignes valides maintenant ou corriger le fichier et le téléverser à nouveau.',
	],
	['Válida', 'Valid', 'Valide'],
	['Error', 'Error', 'Erreur'],
	[
		'La vista muestra las primeras 500 filas; los totales incluyen el archivo completo.',
		'The preview shows the first 500 rows; totals include the entire file.',
		'L’aperçu affiche les 500 premières lignes ; les totaux incluent le fichier complet.',
	],
	['Elegir otro archivo', 'Choose another file', 'Choisir un autre fichier'],
	['Sincronizando…', 'Synchronizing…', 'Synchronisation…'],
	['Actualizar fotografía', 'Update photo', 'Mettre à jour la photo'],
	['Archivo del padrón', 'Roster file', 'Fichier du registre'],
	[
		'No fue posible cargar el padrón de la iglesia.',
		'The church roster could not be loaded.',
		'Le registre de l’église n’a pas pu être chargé.',
	],
	[
		'Seleccione la plantilla completada en formato XLSX o CSV.',
		'Select the completed template in XLSX or CSV format.',
		'Sélectionnez le modèle rempli au format XLSX ou CSV.',
	],
	[
		'No fue posible analizar el archivo.',
		'The file could not be analyzed.',
		'Le fichier n’a pas pu être analysé.',
	],
	[
		'No se detectaron filas inválidas.',
		'No invalid rows were detected.',
		'Aucune ligne non valide n’a été détectée.',
	],
	[
		'No fue posible confirmar la importación.',
		'The import could not be confirmed.',
		'L’importation n’a pas pu être confirmée.',
	],
	[
		'No fue posible cargar la fotografía.',
		'The photo could not be uploaded.',
		'La photo n’a pas pu être téléversée.',
	],
	['Sin identificar', 'Unidentified', 'Non identifié'],
	['Padrón actualizado', 'Roster updated', 'Registre mis à jour'],
	['Espacios de trabajo', 'Workspaces', 'Espaces de travail'],
	['Áreas de trabajo', 'Work areas', 'Espaces de travail'],
	['Recursos compartidos', 'Shared resources', 'Ressources partagées'],
	['Programación de cultos', 'Worship service planning', 'Planification des cultes'],
	['Buscar mis áreas de trabajo', 'Search my work areas', 'Rechercher mes espaces de travail'],
	['Buscar departamento…', 'Search departments…', 'Rechercher un département…'],
	['No hay áreas que coincidan.', 'No work areas match.', 'Aucun espace ne correspond.'],
	['Todas las áreas de trabajo', 'All work areas', 'Tous les espaces de travail'],
	['Abre un departamento para trabajar con su equipo, sus planes y su información.', 'Open a department to work with its team, plans, and information.', 'Ouvrez un département pour travailler avec son équipe, ses plans et ses informations.'],
	['No tiene acceso al área de trabajo solicitada.', 'You do not have access to the requested work area.', 'Vous n’avez pas accès à l’espace de travail demandé.'],
	['Adoración', 'Worship', 'Adoration'],
	['Audiovisuales', 'Audiovisual', 'Audiovisuel'],
	['Música', 'Music', 'Musique'],
	['Publicidad', 'Publicity', 'Publicité'],
	['Secretaría departamental', 'Department secretary', 'Secrétariat du département'],
	['Colaborador/a', 'Contributor', 'Collaborateur/Collaboratrice'],
	['Club de Aventureros', 'Adventurer Club', 'Club des Aventuriers'],
	['Club de Conquistadores', 'Pathfinder Club', 'Club des Éclaireurs'],
	['Club de Guías', 'Master Guide Club', 'Club des Maîtres-Guides'],
	['Clubes', 'Clubs', 'Clubs'],
	['Comunicaciones', 'Communication', 'Communication'],
	['Diaconisas', 'Deaconesses', 'Diaconesses'],
	['Diáconos', 'Deacons', 'Diacres'],
	['Dorcas', 'Dorcas', 'Dorcas'],
	['Educación', 'Education', 'Éducation'],
	['Escuela Sabática', 'Sabbath School', 'École du Sabbat'],
	['Hogar y Familia', 'Home and Family', 'Foyer et Famille'],
	['Libertad Religiosa', 'Religious Liberty', 'Liberté Religieuse'],
	['Familia', 'Family Ministries', 'Ministère de la Famille'],
	['Jóvenes', 'Youth', 'Jeunesse'],
	['Mantenimiento', 'Maintenance', 'Entretien'],
	['Mayordomía', 'Stewardship', 'Gestion chrétienne de la vie'],
	['Ministerio de Caballeros', 'Men’s Ministries', 'Ministère des Hommes'],
	['Ministerio de Música', 'Music Ministries', 'Ministère de la Musique'],
	['Ministerio de Oración', 'Prayer Ministries', 'Ministère de la Prière'],
	['Ministerio de Publicaciones', 'Publishing Ministries', 'Ministère des Publications'],
	['Ministerio Infantil', 'Children’s Ministries', 'Ministère des Enfants'],
	['Ministerios Personales', 'Personal Ministries', 'Ministères Personnels'],
	['Pianistas', 'Pianists', 'Pianistes'],
	['Posibilidades y ADRA', 'Possibility Ministries and ADRA', 'Ministère des Possibilités et ADRA'],
	['Salud', 'Health Ministries', 'Ministère de la Santé'],
	['Secretaría', 'Church Secretariat', 'Secrétariat de l’Église'],
	['Tesorería', 'Treasury', 'Trésorerie'],
	['PORTAFOLIO MINISTERIAL', 'MINISTRY PORTFOLIO', 'PORTEFEUILLE MINISTÉRIEL'],
	[
		'Mis aplicaciones y áreas de trabajo',
		'My applications and workspaces',
		'Mes applications et espaces de travail',
	],
	[
		'Cada acceso proviene de tu cargo. Administración puede abrir todas las aplicaciones del tenant.',
		'Access comes from your position. Administrators can open every application in the tenant.',
		'L’accès découle de votre fonction. L’administration peut ouvrir toutes les applications du tenant.',
	],
	['disponibles', 'available', 'disponibles'],
	[
		'Buscar ministerio o departamento…',
		'Search ministry or department…',
		'Rechercher un ministère ou un département…',
	],
	[
		'Buscar aplicaciones y áreas de trabajo',
		'Search applications and workspaces',
		'Rechercher des applications et des espaces de travail',
	],
	['Aplicación especializada', 'Specialized application', 'Application spécialisée'],
	['Espacio departamental', 'Department workspace', 'Espace départemental'],
	['Administración integral', 'Full administration', 'Administration complète'],
	[
		'No hay aplicaciones que coincidan con la búsqueda.',
		'No applications match your search.',
		'Aucune application ne correspond à votre recherche.',
	],
	[
		'Operaciones ministeriales',
		'Ministry operations',
		'Opérations ministérielles',
	],
	[
		'Centro de operaciones ministeriales',
		'Ministry operations center',
		'Centre des opérations ministérielles',
	],
	[
		'ESPACIO DE TRABAJO CONECTADO',
		'CONNECTED WORKSPACE',
		'ESPACE DE TRAVAIL CONNECTÉ',
	],
	['Gobierno y misión', 'Governance and mission', 'Gouvernance et mission'],
	[
		'Manual de Iglesia Adventista, 21.ª edición revisada en 2025 · las decisiones permanecen bajo la autoridad correspondiente.',
		'Seventh-day Adventist Church Manual, 21st edition revised in 2025 · decisions remain under the appropriate authority.',
		'Manuel d’Église adventiste, 21e édition révisée en 2025 · les décisions restent sous l’autorité compétente.',
	],
	['Departamento activo', 'Active department', 'Département actif'],
	['integrantes conectados', 'connected team members', 'membres connectés'],
	['Control', 'Control center', 'Centre de contrôle'],
	['Estrategia', 'Strategy', 'Stratégie'],
	['Programas', 'Programs', 'Programmes'],
	['Tareas', 'Tasks', 'Tâches'],
	['Presupuesto', 'Budget', 'Budget'],
	['Reuniones', 'Meetings', 'Réunions'],
	['Operación', 'Operations', 'Opérations'],
	['Planes activos', 'Active plans', 'Plans actifs'],
	['Iniciativas activas', 'Active initiatives', 'Initiatives actives'],
	['Requieren atención', 'Need attention', 'Nécessitent une attention'],
	['Tareas vencidas', 'Overdue tasks', 'Tâches en retard'],
	['Disponible', 'Available', 'Disponible'],
	['EJECUCIÓN PRIORITARIA', 'EXECUTION PRIORITIES', 'PRIORITÉS D’EXÉCUTION'],
	[
		'Lo que necesita atención',
		'What needs attention',
		'Ce qui nécessite une attention',
	],
	['Responsable por definir', 'Owner to be assigned', 'Responsable à désigner'],
	[
		'Comienza el plan anual',
		'Start the annual plan',
		'Commencez le plan annuel',
	],
	[
		'Crea el primer plan y convierte sus objetivos en programas medibles.',
		'Create the first plan and turn its objectives into measurable programs.',
		'Créez le premier plan et transformez ses objectifs en programmes mesurables.',
	],
	['PRONÓSTICO OPERATIVO', 'OPERATING FORECAST', 'PRÉVISION OPÉRATIONNELLE'],
	['Señal de ejecución', 'Execution signal', 'Indicateur d’exécution'],
	['entrega prevista', 'forecast delivery', 'livraison prévue'],
	[
		'El pronóstico es orientativo y nunca sustituye el criterio de la dirección.',
		'The forecast is advisory and never replaces leadership judgment.',
		'La prévision est indicative et ne remplace jamais le jugement de la direction.',
	],
	['INDICADORES', 'INDICATORS', 'INDICATEURS'],
	['Resultados medibles', 'Measurable outcomes', 'Résultats mesurables'],
	['Indicador', 'Indicator', 'Indicateur'],
	[
		'Aún no hay indicadores. Define resultados que el equipo pueda revisar durante el año.',
		'There are no indicators yet. Define outcomes the team can review throughout the year.',
		'Il n’y a pas encore d’indicateurs. Définissez des résultats que l’équipe pourra suivre tout au long de l’année.',
	],
	['GUÍA DEL ESPACIO', 'WORKSPACE GUIDANCE', 'GUIDE DE L’ESPACE'],
	['Controles esenciales', 'Essential controls', 'Contrôles essentiels'],
	['DIRECCIÓN ANUAL', 'ANNUAL DIRECTION', 'ORIENTATION ANNUELLE'],
	['Planes y objetivos', 'Plans and objectives', 'Plans et objectifs'],
	[
		'Convierte la misión del departamento en objetivos medibles, responsables y fechas.',
		'Turn the department mission into measurable objectives, owners, and dates.',
		'Transformez la mission du département en objectifs mesurables, responsables et dates.',
	],
	['Nuevo plan', 'New plan', 'Nouveau plan'],
	[
		'Visión pendiente de documentar.',
		'Vision still to be documented.',
		'Vision à documenter.',
	],
	['Objetivo', 'Objective', 'Objectif'],
	['Aprobar plan', 'Approve plan', 'Approuver le plan'],
	['Sin planes anuales', 'No annual plans', 'Aucun plan annuel'],
	[
		'Crea un plan, define la visión y asigna objetivos al equipo.',
		'Create a plan, define the vision, and assign objectives to the team.',
		'Créez un plan, définissez la vision et attribuez les objectifs à l’équipe.',
	],
	['PROGRAMAS Y CAMPAÑAS', 'PROGRAMS AND CAMPAIGNS', 'PROGRAMMES ET CAMPAGNES'],
	['Ejecución ministerial', 'Ministry execution', 'Exécution ministérielle'],
	[
		'Cada iniciativa puede conectarse a una actividad del calendario central.',
		'Every initiative can be connected to an activity in the central calendar.',
		'Chaque initiative peut être reliée à une activité du calendrier central.',
	],
	['Nueva iniciativa', 'New initiative', 'Nouvelle initiative'],
	[
		'Buscar programa, objetivo o responsable…',
		'Search program, objective, or owner…',
		'Rechercher un programme, un objectif ou un responsable…',
	],
	['Asignar', 'Assign', 'Attribuer'],
	['Avanzar', 'Advance', 'Faire progresser'],
	['Completar', 'Complete', 'Terminer'],
	['Ver calendario', 'View calendar', 'Voir le calendrier'],
	['Calendarizar', 'Schedule', 'Planifier'],
	['No hay iniciativas', 'No initiatives', 'Aucune initiative'],
	[
		'Planifica un programa, campaña, proyecto, capacitación o servicio.',
		'Plan a program, campaign, project, training, or service.',
		'Planifiez un programme, une campagne, un projet, une formation ou un service.',
	],
	['COLABORACIÓN', 'COLLABORATION', 'COLLABORATION'],
	['Trabajo del equipo', 'Team work', 'Travail de l’équipe'],
	[
		'Responsables, fechas límite y seguimiento en un flujo visible.',
		'Owners, due dates, and follow-up in a visible workflow.',
		'Responsables, échéances et suivi dans un flux visible.',
	],
	['Nueva tarea', 'New task', 'Nouvelle tâche'],
	[
		'Buscar tarea o responsable…',
		'Search task or owner…',
		'Rechercher une tâche ou un responsable…',
	],
	['Por iniciar', 'To do', 'À faire'],
	['En progreso', 'In progress', 'En cours'],
	['Bloqueado', 'Blocked', 'Bloqué'],
	['Completado', 'Completed', 'Terminé'],
	['Sin asignar', 'Unassigned', 'Non attribué'],
	['Iniciar', 'Start', 'Commencer'],
	[
		'PRESUPUESTO DEL DEPARTAMENTO',
		'DEPARTMENT BUDGET',
		'BUDGET DU DÉPARTEMENT',
	],
	['Registrar movimiento', 'Record transaction', 'Enregistrer une opération'],
	['Planificado', 'Planned', 'Planifié'],
	['Ejecutado', 'Spent', 'Exécuté'],
	['Utilización', 'Utilization', 'Utilisation'],
	['TRAZABILIDAD', 'TRACEABILITY', 'TRAÇABILITÉ'],
	[
		'Presupuesto por iniciativa',
		'Budget by initiative',
		'Budget par initiative',
	],
	[
		'Los movimientos y aprobaciones quedan registrados en la bitácora inmutable.',
		'Transactions and approvals are recorded in the immutable audit log.',
		'Les opérations et approbations sont consignées dans le journal immuable.',
	],
	['COORDINACIÓN', 'COORDINATION', 'COORDINATION'],
	['Reuniones y actas', 'Meetings and minutes', 'Réunions et procès-verbaux'],
	[
		'Agenda, participantes, acuerdos y evidencia en un solo lugar.',
		'Agenda, participants, decisions, and evidence in one place.',
		'Ordre du jour, participants, décisions et preuves en un seul endroit.',
	],
	['Programar', 'Schedule', 'Planifier'],
	['Lugar por definir', 'Location to be confirmed', 'Lieu à confirmer'],
	['participantes', 'participants', 'participants'],
	['Acta', 'Minutes', 'Procès-verbal'],
	['GOBIERNO', 'GOVERNANCE', 'GOUVERNANCE'],
	['Acuerdos formales', 'Formal decisions', 'Décisions formelles'],
	[
		'La aplicación conserva la decisión; no sustituye la autoridad que la adopta.',
		'The application preserves the decision; it does not replace the authority adopting it.',
		'L’application conserve la décision sans remplacer l’autorité qui l’adopte.',
	],
	['Registrar acuerdo', 'Record decision', 'Enregistrer une décision'],
	['Aprobó:', 'Approved by:', 'Approuvé par :'],
	[
		'CAPACIDADES ESPECIALIZADAS',
		'SPECIALIZED CAPABILITIES',
		'CAPACITÉS SPÉCIALISÉES',
	],
	[
		'Registros diseñados para la operación particular de este ministerio.',
		'Records designed for this ministry’s specific operations.',
		'Registres conçus pour les opérations propres à ce ministère.',
	],
	['Nuevo registro', 'New record', 'Nouveau registre'],
	['Acceso restringido', 'Restricted access', 'Accès restreint'],
	['Solo liderazgo', 'Leadership only', 'Direction uniquement'],
	['Registro operativo', 'Operating record', 'Registre opérationnel'],
	[
		'Biblioteca departamental',
		'Department library',
		'Bibliothèque du département',
	],
	['Abrir biblioteca', 'Open library', 'Ouvrir la bibliothèque'],
	['EQUIPO CONECTADO', 'CONNECTED TEAM', 'ÉQUIPE CONNECTÉE'],
	[
		'Personas, cargos y responsabilidades',
		'People, positions, and responsibilities',
		'Personnes, fonctions et responsabilités',
	],
	[
		'Los accesos provienen de las membresías y cargos configurados para este departamento.',
		'Access is based on memberships and positions configured for this department.',
		'Les accès reposent sur les adhésions et fonctions configurées pour ce département.',
	],
	['Crear plan anual', 'Create annual plan', 'Créer un plan annuel'],
	['Agregar objetivo', 'Add objective', 'Ajouter un objectif'],
	[
		'Asignar responsabilidad',
		'Assign responsibility',
		'Attribuer une responsabilité',
	],
	['Movimiento presupuestario', 'Budget transaction', 'Opération budgétaire'],
	['Programar reunión', 'Schedule meeting', 'Planifier une réunion'],
	[
		'Cerrar reunión y guardar acta',
		'Close meeting and save minutes',
		'Clore la réunion et enregistrer le procès-verbal',
	],
	[
		'Registrar acuerdo formal',
		'Record formal decision',
		'Enregistrer une décision formelle',
	],
	['Nuevo indicador', 'New indicator', 'Nouvel indicateur'],
	[
		'Nuevo registro ministerial',
		'New ministry record',
		'Nouveau registre ministériel',
	],
	['ESPACIO DE TRABAJO', 'WORKSPACE', 'ESPACE DE TRAVAIL'],
	['Nombre del plan', 'Plan name', 'Nom du plan'],
	['Misión', 'Mission', 'Mission'],
	['Fecha límite', 'Due date', 'Date limite'],
	['Actividad del calendario', 'Calendar activity', 'Activité du calendrier'],
	['Calendarizar después', 'Schedule later', 'Planifier plus tard'],
	[
		'Asigna una responsabilidad concreta en',
		'Assign a specific responsibility for',
		'Attribuez une responsabilité précise pour',
	],
	[
		'El acta cerrará formalmente la reunión y conservará el texto en la auditoría.',
		'The minutes will formally close the meeting and preserve the text in the audit log.',
		'Le procès-verbal clôturera officiellement la réunion et conservera le texte dans le journal d’audit.',
	],
	['Título del acuerdo', 'Decision title', 'Titre de la décision'],
	['Reunión relacionada', 'Related meeting', 'Réunion associée'],
	['Sin reunión enlazada', 'No linked meeting', 'Aucune réunion associée'],
	[
		'No se pudo abrir el espacio',
		'The workspace could not be opened',
		'Impossible d’ouvrir l’espace de travail',
	],
	[
		'No fue posible abrir el espacio departamental.',
		'The department workspace could not be opened.',
		'Impossible d’ouvrir l’espace départemental.',
	],
	['Operación completada', 'Operation completed', 'Opération terminée'],
	[
		'Secciones del espacio departamental',
		'Department workspace sections',
		'Sections de l’espace départemental',
	],
	['Junta de iglesia', 'Church board', 'Comité d’église'],
	['Reunión administrativa', 'Business meeting', 'Assemblée administrative'],
	[
		'Reunión de coordinación',
		'Coordination meeting',
		'Réunion de coordination',
	],
	[
		'No hay un espacio disponible.',
		'No workspace is available.',
		'Aucun espace de travail n’est disponible.',
	],
	[
		'Objetivo agregado al plan.',
		'Objective added to the plan.',
		'Objectif ajouté au plan.',
	],
	[
		'Reunión programada; los participantes fueron notificados.',
		'Meeting scheduled; participants were notified.',
		'Réunion planifiée ; les participants ont été informés.',
	],
	[
		'Acta guardada y reunión cerrada.',
		'Minutes saved and meeting closed.',
		'Procès-verbal enregistré et réunion clôturée.',
	],
	['Ejecución actualizada.', 'Execution updated.', 'Exécution mise à jour.'],
	['Comentar', 'Comment', 'Commenter'],
	['Comentario', 'Comment', 'Commentaire'],
	['Comentario y menciones', 'Comment and mentions', 'Commentaire et mentions'],
	['Mencionar y notificar', 'Mention and notify', 'Mentionner et notifier'],
	[
		'Sin comentarios todavía. Inicia la conversación del equipo.',
		'No comments yet. Start the team conversation.',
		'Aucun commentaire pour le moment. Lancez la conversation de l’équipe.',
	],
	[
		'Comparte un avance, una pregunta o una decisión pendiente…',
		'Share an update, a question, or a pending decision…',
		'Partagez une avancée, une question ou une décision en attente…',
	],
	[
		'Comentario publicado y menciones notificadas.',
		'Comment posted and mentions notified.',
		'Commentaire publié et mentions notifiées.',
	],
	[
		'No fue posible generar el reporte departamental.',
		'The department report could not be generated.',
		'Impossible de générer le rapport départemental.',
	],
	[
		'Reporte PDF generado con trazabilidad.',
		'Traceable PDF report generated.',
		'Rapport PDF traçable généré.',
	],
	[
		'Reporte CSV generado con trazabilidad.',
		'Traceable CSV report generated.',
		'Rapport CSV traçable généré.',
	],
];

const allEntries = [...entries, ...supplementalEntries];
const dictionaries: Record<Locale, Map<string, string>> = {
	es: new Map(),
	en: new Map(allEntries.map(([es, en]) => [es, en])),
	fr: new Map(allEntries.map(([es, , fr]) => [es, fr])),
};

export function normalizeLocale(value?: string | null): Locale {
	const language = value?.toLowerCase().split('-')[0];
	return supportedLocales.includes(language as Locale)
		? (language as Locale)
		: 'es';
}

export function localeTag(locale: Locale): string {
	return localeDetails[locale].tag;
}

function translateDynamic(
	locale: Exclude<Locale, 'es'>,
	value: string,
): string | null {
	const visibleSessions = value.match(/^(\d+) de (\d+) sesiones$/);
	if (visibleSessions)
		return locale === 'en'
			? `${visibleSessions[1]} of ${visibleSessions[2]} ${visibleSessions[2] === '1' ? 'session' : 'sessions'}`
			: `${visibleSessions[1]} ${visibleSessions[1] === '1' ? 'session' : 'sessions'} sur ${visibleSessions[2]}`;
	const confirmedParticipants = value.match(/^(\d+)\/(\d+) confirmados · (\d+) caso\(s\)$/);
	if (confirmedParticipants)
		return locale === 'en'
			? `${confirmedParticipants[1]}/${confirmedParticipants[2]} confirmed · ${confirmedParticipants[3]} ${confirmedParticipants[3] === '1' ? 'case' : 'cases'}`
			: `${confirmedParticipants[1]}/${confirmedParticipants[2]} ${confirmedParticipants[1] === '1' ? 'confirmé' : 'confirmés'} · ${confirmedParticipants[3]} ${confirmedParticipants[3] === '1' ? 'dossier' : 'dossiers'}`;
	const approvedBudget = value.match(/^((?:RD\$|US\$|\$|€)\s?[\d.,]+) aprobado$/);
	if (approvedBudget)
		return locale === 'en'
			? `${approvedBudget[1]} approved`
			: `${approvedBudget[1]} approuvé`;
	const rosterVisible = value.match(/^(\d+) de (\d+) perfiles visibles$/);
	if (rosterVisible)
		return locale === 'en'
			? `${rosterVisible[1]} of ${rosterVisible[2]} visible profiles`
			: `${rosterVisible[1]} profils visibles sur ${rosterVisible[2]}`;
	const rosterContact = value.match(/^(.+) · (.+?)(?: · (\d+) años)?$/);
	if (rosterContact && rosterContact[3])
		return locale === 'en'
			? `${rosterContact[1]} · ${rosterContact[2]} · age ${rosterContact[3]}`
			: `${rosterContact[1]} · ${rosterContact[2]} · ${rosterContact[3]} ans`;
	const importedRoster = value.match(
		/^(\d+) personas importadas: (\d+) nuevas y (\d+) actualizadas\. (.+)$/,
	);
	if (importedRoster) {
		const excluded = importedRoster[4]?.match(
			/^(\d+) filas con errores fueron excluidas\.$/,
		);
		const suffix = excluded
			? locale === 'en'
				? `${excluded[1]} rows with errors were excluded.`
				: `${excluded[1]} lignes comportant des erreurs ont été exclues.`
			: translateText(locale, importedRoster[4] ?? '');
		return locale === 'en'
			? `${importedRoster[1]} people imported: ${importedRoster[2]} new and ${importedRoster[3]} updated. ${suffix}`
			: `${importedRoster[1]} personnes importées : ${importedRoster[2]} nouvelles et ${importedRoster[3]} mises à jour. ${suffix}`;
	}
	const photoUpdated = value.match(/^Fotografía actualizada para (.+)\.$/);
	if (photoUpdated)
		return locale === 'en'
			? `Photo updated for ${photoUpdated[1]}.`
			: `Photo mise à jour pour ${photoUpdated[1]}.`;
	const photoLabel = value.match(/^(Foto de|Cargar fotografía de) (.+)$/);
	if (photoLabel)
		return locale === 'en'
			? `${photoLabel[1] === 'Foto de' ? 'Photo of' : 'Upload photo for'} ${photoLabel[2]}`
			: `${photoLabel[1] === 'Foto de' ? 'Photo de' : 'Téléverser une photo pour'} ${photoLabel[2]}`;
	const importRows = value.match(/^Importar (\d+) filas válidas$/);
	if (importRows)
		return locale === 'en'
			? `Import ${importRows[1]} valid rows`
			: `Importer ${importRows[1]} lignes valides`;
	const importSummary = value.match(
		/^(\d+) filas · (\d+) válidas · (\d+) con error$/,
	);
	if (importSummary)
		return locale === 'en'
			? `${importSummary[1]} rows · ${importSummary[2]} valid · ${importSummary[3]} with errors`
			: `${importSummary[1]} lignes · ${importSummary[2]} valides · ${importSummary[3]} avec erreurs`;
	const turningAge = value.match(/^Cumple (\d+) años · (.+)$/);
	if (turningAge)
		return locale === 'en'
			? `Turns ${turningAge[1]} · ${turningAge[2]}`
			: `Fête ses ${turningAge[1]} ans · ${turningAge[2]}`;
	const birthdayTodayTitle = value.match(/^Cumpleaños de (.+) hoy$/);
	if (birthdayTodayTitle)
		return locale === 'en'
			? `${birthdayTodayTitle[1]}’s birthday is today`
			: `C’est l’anniversaire de ${birthdayTodayTitle[1]} aujourd’hui`;
	const upcomingBirthdayTitle = value.match(/^Cumpleaños próximo · (.+)$/);
	if (upcomingBirthdayTitle)
		return locale === 'en'
			? `Upcoming birthday · ${upcomingBirthdayTitle[1]}`
			: `Anniversaire à venir · ${upcomingBirthdayTitle[1]}`;
	const birthdayTodayBody = value.match(
		/^Hoy celebramos la vida de (.+)\. Recuerda contactarla y acompañarla\.$/,
	);
	if (birthdayTodayBody)
		return locale === 'en'
			? `Today we celebrate ${birthdayTodayBody[1]}’s life. Remember to contact and support her.`
			: `Aujourd’hui, nous célébrons la vie de ${birthdayTodayBody[1]}. Pensez à la contacter et à l’accompagner.`;
	const birthdayInDays = value.match(
		/^(.+) cumple años en (\d+) día\(s\), el (.+)\.$/,
	);
	if (birthdayInDays)
		return locale === 'en'
			? `${birthdayInDays[1]}’s birthday is in ${birthdayInDays[2]} day(s), on ${birthdayInDays[3]}.`
			: `L’anniversaire de ${birthdayInDays[1]} est dans ${birthdayInDays[2]} jour(s), le ${birthdayInDays[3]}.`;
	const prepareBirthday = value.match(
		/^Preparar saludo de cumpleaños para (.+)$/,
	);
	if (prepareBirthday)
		return locale === 'en'
			? `Prepare birthday greeting for ${prepareBirthday[1]}`
			: `Préparer le message d’anniversaire pour le ${prepareBirthday[1]}`;
	const auditWeek = value.match(/^(\d+) en 7 días$/);
	if (auditWeek)
		return locale === 'en'
			? `${auditWeek[1]} in 7 days`
			: `${auditWeek[1]} sur 7 jours`;
	const auditPagination = value.match(
		/^Mostrando (\d+) de (\d+) eventos · Página (\d+) de (\d+)$/,
	);
	if (auditPagination)
		return locale === 'en'
			? `Showing ${auditPagination[1]} of ${auditPagination[2]} events · Page ${auditPagination[3]} of ${auditPagination[4]}`
			: `Affichage de ${auditPagination[1]} sur ${auditPagination[2]} événements · Page ${auditPagination[3]} sur ${auditPagination[4]}`;
	const failedAction = value.match(/^No fue posible (.+?)(\.)?$/);
	if (failedAction) {
		const actions: Record<string, readonly [string, string]> = {
			'abrir el módulo de Ancianos': [
				'open the Elders module',
				'ouvrir le module des anciens',
			],
			'abrir el módulo': ['open the module', 'ouvrir le module'],
			'abrir la actividad': ['open the activity', 'ouvrir l’activité'],
			'abrir la biblioteca ministerial': [
				'open the ministry library',
				'ouvrir la bibliothèque ministérielle',
			],
			'abrir Nombramientos': ['open Nominations', 'ouvrir Nominations'],
			'actualizar el rol': ['update the role', 'mettre à jour le rôle'],
			'actualizar la sesión': [
				'update the session',
				'mettre à jour la session',
			],
			'agregar el integrante': ['add the member', 'ajouter le membre'],
			'cargar el archivo': ['upload the file', 'téléverser le fichier'],
			'cargar el centro de control': [
				'load the control center',
				'charger le centre de contrôle',
			],
			'cargar el diseñador': ['load the designer', 'charger le concepteur'],
			'cargar el documento': ['load the document', 'charger le document'],
			'cargar el equipo': ['load the team', 'charger l’équipe'],
			'cargar la configuración de canales': [
				'load channel settings',
				'charger les paramètres des canaux',
			],
			'cargar la junta de revisión': [
				'load the review board',
				'charger le comité de révision',
			],
			'cargar los departamentos': [
				'load departments',
				'charger les départements',
			],
			'cerrar la cobertura': [
				'close the coverage assignment',
				'clôturer la couverture',
			],
			'completar el reporte': ['complete the report', 'terminer le rapport'],
			'completar la acción': ['complete the action', 'terminer l’action'],
			'completar la solicitud': ['complete the request', 'terminer la demande'],
			'crear el departamento': [
				'create the department',
				'créer le département',
			],
			'crear el usuario': ['create the user', 'créer l’utilisateur'],
			'crear la actividad': ['create the activity', 'créer l’activité'],
			'crear la alternativa': ['create the alternative', 'créer l’alternative'],
			'crear la sesión de junta': [
				'create the board session',
				'créer la session du comité',
			],
			'descargar el documento': [
				'download the document',
				'télécharger le document',
			],
			'descargar el reporte': ['download the report', 'télécharger le rapport'],
			'ejecutar la prueba': ['run the test', 'exécuter le test'],
			'enviar la solicitud': ['submit the request', 'envoyer la demande'],
			'generar el calendario anual': [
				'generate the annual calendar',
				'générer le calendrier annuel',
			],
			'generar el reporte': ['generate the report', 'générer le rapport'],
			'generar la vista previa segura': [
				'generate the secure preview',
				'générer l’aperçu sécurisé',
			],
			'guardar el borrador': ['save the draft', 'enregistrer le brouillon'],
			'guardar el programa': ['save the program', 'enregistrer le programme'],
			'guardar el turno': ['save the rotation', 'enregistrer le tour'],
			'guardar la cobertura departamental': [
				'save department coverage',
				'enregistrer la couverture départementale',
			],
			'guardar la configuración': [
				'save the settings',
				'enregistrer les paramètres',
			],
			'guardar los cambios': [
				'save the changes',
				'enregistrer les modifications',
			],
			'preparar la descarga': [
				'prepare the download',
				'préparer le téléchargement',
			],
			'preparar la exportación': [
				'prepare the export',
				'préparer l’exportation',
			],
			'procesar la solicitud': ['process the request', 'traiter la demande'],
			'publicar el formulario': ['publish the form', 'publier le formulaire'],
			'registrar la asistencia': [
				'record attendance',
				'enregistrer la présence',
			],
			'registrar la revisión': ['record the review', 'enregistrer la révision'],
			'responder la convocatoria': [
				'respond to the invitation',
				'répondre à l’invitation',
			],
			'retirar al integrante': ['remove the member', 'retirer le membre'],
			'retirar el documento': ['remove the document', 'retirer le document'],
			'verificar la fecha': ['check the date', 'vérifier la date'],
			'visualizar el documento': [
				'preview the document',
				'visualiser le document',
			],
		};
		const action = actions[failedAction[1]!];
		if (action) {
			const translatedAction = action[locale === 'en' ? 0 : 1];
			const prefix =
				locale === 'en'
					? 'Could not '
					: /^[aeioué]/i.test(translatedAction)
						? 'Impossible d’'
						: 'Impossible de ';
			return `${prefix}${translatedAction}${failedAction[2] ?? ''}`;
		}
	}
	const visible = value.match(/^(\d+) de (\d+) visibles$/);
	if (visible)
		return locale === 'en'
			? `${visible[1]} of ${visible[2]} visible`
			: `${visible[1]} sur ${visible[2]} visibles`;
	const activities = value.match(/^(\d+) actividades?$/);
	if (activities)
		return locale === 'en'
			? `${activities[1]} ${activities[1] === '1' ? 'activity' : 'activities'}`
			: `${activities[1]} ${activities[1] === '1' ? 'activité' : 'activités'}`;
	const users = value.match(/^(\d+) usuarios?$/);
	if (users)
		return locale === 'en'
			? `${users[1]} ${users[1] === '1' ? 'user' : 'users'}`
			: `${users[1]} ${users[1] === '1' ? 'utilisateur' : 'utilisateurs'}`;
	const departments = value.match(/^(\d+) departamentos?$/);
	if (departments)
		return locale === 'en'
			? `${departments[1]} ${departments[1] === '1' ? 'department' : 'departments'}`
			: `${departments[1]} ${departments[1] === '1' ? 'département' : 'départements'}`;
	const ratioActivities = value.match(/^(\d+)\/(\d+) actividades$/);
	if (ratioActivities)
		return locale === 'en'
			? `${ratioActivities[1]}/${ratioActivities[2]} activities`
			: `${ratioActivities[1]}/${ratioActivities[2]} activités`;
	const activeActivities = value.match(/^(\d+) activas$/);
	if (activeActivities)
		return locale === 'en'
			? `${activeActivities[1]} active`
			: `${activeActivities[1]} actives`;
	const overdueAfterSeparator = value.match(/^·\s*(\d+) vencidas$/);
	if (overdueAfterSeparator)
		return locale === 'en'
			? `· ${overdueAfterSeparator[1]} overdue`
			: `· ${overdueAfterSeparator[1]} en retard`;
	const departmentAssignments = value.match(
		/^(\d+) enlace\(s\) departamental\(es\) activo\(s\)$/,
	);
	if (departmentAssignments)
		return locale === 'en'
			? `${departmentAssignments[1]} active department assignment(s)`
			: `${departmentAssignments[1]} liaison(s) départementale(s) active(s)`;
	const shortDays = value.match(/^(\d+) días$/);
	if (shortDays)
		return locale === 'en' ? `${shortDays[1]} days` : `${shortDays[1]} jours`;
	const days = value.match(/^(\d+) días? de anticipación$/);
	if (days)
		return locale === 'en'
			? `${days[1]} days in advance`
			: `${days[1]} jours à l’avance`;
	const attempts = value.match(/^(\d+) intentos?$/);
	if (attempts)
		return locale === 'en'
			? `${attempts[1]} attempts`
			: `${attempts[1]} tentatives`;
	const updated = value.match(/^Actualizado (.+)$/);
	if (updated)
		return locale === 'en'
			? `Updated ${updated[1]}`
			: `Mis à jour ${updated[1]}`;
	const until = value.match(/^Hasta (.+)$/);
	if (until)
		return locale === 'en' ? `Until ${until[1]}` : `Jusqu’à ${until[1]}`;
	const matters = value.match(/^(\d+) asuntos necesitan acción\.$/);
	if (matters)
		return locale === 'en'
			? `${matters[1]} items require action.`
			: `${matters[1]} éléments nécessitent une intervention.`;
	const attendees = value.match(/^(\d+) asistentes$/);
	if (attendees)
		return locale === 'en'
			? `${attendees[1]} attendees`
			: `${attendees[1]} participants`;
	const membersAndActivities = value.match(
		/^(\d+) integrantes? · (\d+) actividades?$/,
	);
	if (membersAndActivities)
		return locale === 'en'
			? `${membersAndActivities[1]} members · ${membersAndActivities[2]} activities`
			: `${membersAndActivities[1]} membres · ${membersAndActivities[2]} activités`;
	const confirmedCases = value.match(/^(\d+) confirmados? · (\d+) caso\(s\)$/);
	if (confirmedCases)
		return locale === 'en'
			? `${confirmedCases[1]} confirmed · ${confirmedCases[2]} cases`
			: `${confirmedCases[1]} confirmés · ${confirmedCases[2]} dossiers`;
	const presented = value.match(/^Presentada (.+)$/);
	if (presented)
		return locale === 'en'
			? `Submitted ${presented[1]}`
			: `Soumise ${presented[1]}`;
	const preference = value.match(/^Preferencia: (.+)$/);
	if (preference)
		return locale === 'en'
			? `Priority: ${preference[1]}`
			: `Priorité : ${preference[1]}`;
	const activitiesOf = value.match(/^Actividades de (.+)$/);
	if (activitiesOf)
		return locale === 'en'
			? `Activities for ${activitiesOf[1]}`
			: `Activités de ${activitiesOf[1]}`;
	const viewActivities = value.match(
		/^Ver (\d+) actividades (planificadas|completadas|vencidas) de (.+)$/,
	);
	if (viewActivities) {
		const labels =
			locale === 'en'
				? {
						planificadas: 'planned',
						completadas: 'completed',
						vencidas: 'overdue',
					}
				: {
						planificadas: 'planifiées',
						completadas: 'terminées',
						vencidas: 'en retard',
					};
		return locale === 'en'
			? `View ${viewActivities[1]} ${labels[viewActivities[2] as keyof typeof labels]} activities for ${viewActivities[3]}`
			: `Voir ${viewActivities[1]} activités ${labels[viewActivities[2] as keyof typeof labels]} de ${viewActivities[3]}`;
	}
	const viewStatusActivities = value.match(
		/^Ver (\d+) actividades (completadas|incompletas|vencidas|aprobadas|pendientes|que requieren atención)$/,
	);
	if (viewStatusActivities) {
		const labels =
			locale === 'en'
				? {
						completadas: 'completed',
						incompletas: 'incomplete',
						vencidas: 'overdue',
						aprobadas: 'approved',
						pendientes: 'pending',
						'que requieren atención': 'requiring attention',
					}
				: {
						completadas: 'terminées',
						incompletas: 'incomplètes',
						vencidas: 'en retard',
						aprobadas: 'approuvées',
						pendientes: 'en attente',
						'que requieren atención': 'nécessitant une intervention',
					};
		return locale === 'en'
			? `View ${viewStatusActivities[1]} ${labels[viewStatusActivities[2] as keyof typeof labels]} activities`
			: `Voir ${viewStatusActivities[1]} activités ${labels[viewStatusActivities[2] as keyof typeof labels]}`;
	}
	const viewOpenConflicts = value.match(/^Ver (\d+) conflictos abiertos$/);
	if (viewOpenConflicts)
		return locale === 'en'
			? `View ${viewOpenConflicts[1]} open conflicts`
			: `Voir ${viewOpenConflicts[1]} conflits ouverts`;
	const viewDepartmentActivities = value.match(
		/^Ver (\d+) actividades de (.+)$/,
	);
	if (viewDepartmentActivities)
		return locale === 'en'
			? `View ${viewDepartmentActivities[1]} activities for ${viewDepartmentActivities[2]}`
			: `Voir ${viewDepartmentActivities[1]} activités de ${viewDepartmentActivities[2]}`;
	const operationalHealth = value.match(
		/^Abrir las actividades que determinan la salud operativa: (\d+) puntos$/,
	);
	if (operationalHealth)
		return locale === 'en'
			? `Open the activities that determine operational health: ${operationalHealth[1]} points`
			: `Ouvrir les activités qui déterminent la santé opérationnelle : ${operationalHealth[1]} points`;
	const planned = value.match(/^(\d+) planificadas$/);
	if (planned)
		return locale === 'en'
			? `${planned[1]} planned`
			: `${planned[1]} planifiées`;
	const completed = value.match(/^(\d+) completadas$/);
	if (completed)
		return locale === 'en'
			? `${completed[1]} completed`
			: `${completed[1]} terminées`;
	const overdue = value.match(/^(\d+) vencidas$/);
	if (overdue)
		return locale === 'en'
			? `${overdue[1]} overdue`
			: `${overdue[1]} en retard`;
	const monthYear = value.match(
		/^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre) de (\d{4})$/i,
	);
	if (monthYear) {
		const months: Record<string, readonly [string, string]> = {
			enero: ['January', 'janvier'],
			febrero: ['February', 'février'],
			marzo: ['March', 'mars'],
			abril: ['April', 'avril'],
			mayo: ['May', 'mai'],
			junio: ['June', 'juin'],
			julio: ['July', 'juillet'],
			agosto: ['August', 'août'],
			septiembre: ['September', 'septembre'],
			octubre: ['October', 'octobre'],
			noviembre: ['November', 'novembre'],
			diciembre: ['December', 'décembre'],
		};
		const translatedMonth =
			months[monthYear[1]!.toLowerCase()]![locale === 'en' ? 0 : 1];
		return locale === 'en'
			? `${translatedMonth} ${monthYear[2]}`
			: `${translatedMonth} ${monthYear[2]}`;
	}
	const rangedActivityLabel = value.match(
		/^Actividades (planificadas|completadas|vencidas) · (.+)$/,
	);
	if (rangedActivityLabel) {
		const kind =
			locale === 'en'
				? {
						planificadas: 'Planned activities',
						completadas: 'Completed activities',
						vencidas: 'Overdue activities',
					}
				: {
						planificadas: 'Activités planifiées',
						completadas: 'Activités terminées',
						vencidas: 'Activités en retard',
					};
		return `${kind[rangedActivityLabel[1] as keyof typeof kind]} · ${translateText(locale, rangedActivityLabel[2]!)}`;
	}
	const closedActivities = value.match(
		/^(\d+) actividades ya finalizaron y continúan abiertas\.$/,
	);
	if (closedActivities)
		return locale === 'en'
			? `${closedActivities[1]} activities have ended and remain open.`
			: `${closedActivities[1]} activités sont terminées et restent ouvertes.`;
	const unresolvedConflicts = value.match(
		/^(\d+) conflictos todavía requieren resolución de la junta\.$/,
	);
	if (unresolvedConflicts)
		return locale === 'en'
			? `${unresolvedConflicts[1]} conflicts still require board resolution.`
			: `${unresolvedConflicts[1]} conflits nécessitent encore une décision du comité.`;
	const rateChanged = value.match(
		/^La tasa de cierre cambió ([+-]?\d+(?:\.\d+)?) puntos frente al período anterior\.$/,
	);
	if (rateChanged)
		return locale === 'en'
			? `The completion rate changed by ${rateChanged[1]} points versus the previous period.`
			: `Le taux d’achèvement a varié de ${rateChanged[1]} points par rapport à la période précédente.`;
	const leadingDepartment = value.match(
		/^(.+) lidera el período con (\d+(?:\.\d+)?)% de cumplimiento\.$/,
	);
	if (leadingDepartment)
		return locale === 'en'
			? `${leadingDepartment[1]} leads the period with ${leadingDepartment[2]}% completion.`
			: `${leadingDepartment[1]} domine la période avec ${leadingDepartment[2]} % d’achèvement.`;
	const leadAverage = value.match(
		/^Las actividades se registran con (\d+) días de anticipación en promedio\.$/,
	);
	if (leadAverage)
		return locale === 'en'
			? `Activities are registered an average of ${leadAverage[1]} days in advance.`
			: `Les activités sont enregistrées en moyenne ${leadAverage[1]} jours à l’avance.`;
	const systemFragments: Record<string, readonly [string, string]> = {
		'ya cuenta con aprobación': ['already approved', 'déjà approuvée'],
		'mantiene un conflicto abierto': [
			'has an open conflict',
			'présente un conflit ouvert',
		],
		'continúa como borrador': [
			'remains a draft',
			'reste à l’état de brouillon',
		],
		'espera correcciones': ['awaiting corrections', 'attend des corrections'],
		'espera decisión': ['awaiting a decision', 'attend une décision'],
		'tiene menos anticipación que el patrón reciente': [
			'has less lead time than the recent pattern',
			'dispose de moins d’anticipation que la tendance récente',
		],
		'conserva una anticipación saludable': [
			'maintains healthy lead time',
			'conserve une anticipation satisfaisante',
		],
		'las últimas actividades muestran fricción de coordinación': [
			'recent activities show coordination friction',
			'les activités récentes présentent des difficultés de coordination',
		],
		'el historial reciente muestra coordinación estable': [
			'recent history shows stable coordination',
			'l’historique récent montre une coordination stable',
		],
		' fue enviada para aprobación.': [
			' was submitted for approval.',
			' a été soumise pour approbation.',
		],
		' conserva provisionalmente el horario seleccionado.': [
			' provisionally retains the selected time.',
			' conserve provisoirement l’horaire sélectionné.',
		],
		' presenta un conflicto ': [' has a conflict ', ' présente un conflit '],
		' fue aprobada y ya forma parte del calendario.': [
			' was approved and is now part of the calendar.',
			' a été approuvée et fait désormais partie du calendrier.',
		],
		' fue cancelada y liberó su horario.': [
			' was cancelled and released its time slot.',
			' a été annulée et a libéré son créneau.',
		],
		' recibió cambios en su planificación.': [
			' received planning changes.',
			' a fait l’objet de modifications de planification.',
		],
		' recibió una recomendación de la junta.': [
			' received a board recommendation.',
			' a reçu une recommandation du comité.',
		],
		' fue actualizada.': [' was updated.', ' a été mise à jour.'],
		' fue cancelada.': [' was cancelled.', ' a été annulée.'],
		' tiene otra fecha disponible para confirmar.': [
			' has another available date to confirm.',
			' dispose d’une autre date à confirmer.',
		],
		' se realizará en una semana.': [
			' will take place in one week.',
			' aura lieu dans une semaine.',
		],
		' se realizará en las próximas 24 horas.': [
			' will take place within the next 24 hours.',
			' aura lieu dans les prochaines 24 heures.',
		],
		' comenzará en 2 horas': [
			' will begin in 2 hours',
			' commencera dans 2 heures',
		],
		' comenzará en una hora': [
			' will begin in one hour',
			' commencera dans une heure',
		],
		' comenzará en 30 minutos': [
			' will begin in 30 minutes',
			' commencera dans 30 minutes',
		],
		' comenzará en 15 minutos': [
			' will begin in 15 minutes',
			' commencera dans 15 minutes',
		],
		' será en 24 horas': [
			' will take place in 24 hours',
			' aura lieu dans 24 heures',
		],
	};
	let systemLocalized = value;
	for (const [fragment, translations] of Object.entries(systemFragments))
		systemLocalized = systemLocalized
			.split(fragment)
			.join(translations[locale === 'en' ? 0 : 1]);
	if (systemLocalized !== value) return systemLocalized;
	const dateWords: Record<string, readonly [string, string]> = {
		lunes: ['Monday', 'lundi'],
		martes: ['Tuesday', 'mardi'],
		miércoles: ['Wednesday', 'mercredi'],
		jueves: ['Thursday', 'jeudi'],
		viernes: ['Friday', 'vendredi'],
		sábado: ['Saturday', 'samedi'],
		domingo: ['Sunday', 'dimanche'],
		lun: ['Mon', 'lun.'],
		mar: ['Tue', 'mar.'],
		mié: ['Wed', 'mer.'],
		jue: ['Thu', 'jeu.'],
		vie: ['Fri', 'ven.'],
		sáb: ['Sat', 'sam.'],
		dom: ['Sun', 'dim.'],
		enero: ['January', 'janvier'],
		febrero: ['February', 'février'],
		marzo: ['March', 'mars'],
		abril: ['April', 'avril'],
		mayo: ['May', 'mai'],
		junio: ['June', 'juin'],
		julio: ['July', 'juillet'],
		agosto: ['August', 'août'],
		septiembre: ['September', 'septembre'],
		octubre: ['October', 'octobre'],
		noviembre: ['November', 'novembre'],
		diciembre: ['December', 'décembre'],
		ene: ['Jan', 'janv.'],
		feb: ['Feb', 'févr.'],
		abr: ['Apr', 'avr.'],
		jun: ['Jun', 'juin'],
		jul: ['Jul', 'juil.'],
		ago: ['Aug', 'août'],
		sept: ['Sep', 'sept.'],
		oct: ['Oct', 'oct.'],
		nov: ['Nov', 'nov.'],
		dic: ['Dec', 'déc.'],
	};
	let localized = value;
	for (const [word, translations] of Object.entries(dateWords)) {
		localized = localized.replace(
			new RegExp(`(?<!\\p{L})${word}(?!\\p{L})`, 'giu'),
			(match) => {
				const translatedWord = translations[locale === 'en' ? 0 : 1];
				const allUppercase = match === match.toLocaleUpperCase('es');
				const capitalized = match[0] === match[0]?.toLocaleUpperCase('es');
				return allUppercase
					? translatedWord.toLocaleUpperCase(locale)
					: capitalized
						? translatedWord[0]!.toLocaleUpperCase(locale) +
							translatedWord.slice(1)
						: translatedWord;
			},
		);
	}
	localized = localized
		.replace(/\bp\.\s*m\./gi, locale === 'en' ? 'PM' : '')
		.replace(/\ba\.\s*m\./gi, locale === 'en' ? 'AM' : '');
	if (localized !== value) return localized.replace(/\s{2,}/g, ' ').trim();
	return null;
}

export function translateText(locale: Locale, input: string): string {
	if (locale === 'es' || !input.trim()) return input;
	const leading = input.match(/^\s*/)?.[0] ?? '';
	const trailing = input.match(/\s*$/)?.[0] ?? '';
	const value = input.trim();
	const translated =
		dictionaries[locale].get(value) ?? translateDynamic(locale, value);
	return translated ? `${leading}${translated}${trailing}` : input;
}

let activeLocale: Locale = 'es';
export function setActiveLocale(locale: Locale) { activeLocale = normalizeLocale(locale); }
export function currentLocale(): Locale { return activeLocale; }

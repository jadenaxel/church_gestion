export type NotificationLocale = 'es' | 'en' | 'fr';
type Template = readonly [string, string];
const translations: Record<string, readonly [Template, Template]> = {
  'activity.submitted': [['Activity submitted', '{title} was submitted for approval.'], ['Activité soumise', '{title} a été soumise pour approbation.']],
  'reservation.provisional_created': [['Time provisionally reserved', '{title} provisionally holds the selected time.'], ['Créneau réservé provisoirement', '{title} conserve provisoirement le créneau sélectionné.']],
  'activity.conflict_detected': [['Calendar conflict', '{title} has a {severity} conflict.'], ['Conflit de calendrier', '{title} présente un conflit {severity}.']],
  'activity.approved': [['Activity approved', '{title} was approved and is now part of the calendar.'], ['Activité approuvée', '{title} a été approuvée et fait désormais partie du calendrier.']],
  'activity.cancelled': [['Activity cancelled', '{title} was cancelled and released its time.'], ['Activité annulée', '{title} a été annulée et a libéré son créneau.']],
  'activity.changed': [['Activity updated', '{title} received planning changes.'], ['Activité mise à jour', 'La planification de {title} a été modifiée.']],
  'review.requested': [['New review request', 'A conflict requires a board review.'], ['Nouvelle demande de révision', 'Un conflit nécessite une révision du conseil.']],
  'review.recommendation_added': [['New recommendation', '{title} received a board recommendation.'], ['Nouvelle recommandation', '{title} a reçu une recommandation du conseil.']],
  'review.decided': [['Decision recorded', '{title}: {decision}.'], ['Décision enregistrée', '{title} : {decision}.']],
  'review.session_invited': [['Review board invitation', '{title} · {when}{location}. Confirm your participation in GestionChurch.'], ['Invitation au conseil de révision', '{title} · {when}{location}. Confirmez votre participation dans GestionChurch.']],
  'review.session_updated': [['Review board updated', '{title} was updated. {when}'], ['Conseil de révision mis à jour', '{title} a été mis à jour. {when}']],
  'review.session_cancelled': [['Review board cancelled', '{title} was cancelled.'], ['Conseil de révision annulé', '{title} a été annulé.']],
  'review.session_response': [['Invitation response', '{participant} {response} {title}.'], ['Réponse à une invitation', '{participant} {response} {title}.']],
  'review.session_reminder_24_hours': [['Review board tomorrow', '{title} will take place in 24 hours{location}.'], ['Conseil de révision demain', '{title} aura lieu dans 24 heures{location}.']],
  'review.session_reminder_2_hours': [['Review board in 2 hours', '{title} will begin in 2 hours{location}.'], ['Conseil de révision dans 2 heures', '{title} commencera dans 2 heures{location}.']],
  'review.session_reminder_1_hour': [['Review board in 1 hour', '{title} will begin in one hour{location}.'], ['Conseil de révision dans 1 heure', '{title} commencera dans une heure{location}.']],
  'review.session_reminder_30_minutes': [['Review board in 30 minutes', '{title} will begin in 30 minutes{location}.'], ['Conseil de révision dans 30 minutes', '{title} commencera dans 30 minutes{location}.']],
  'review.session_reminder_15_minutes': [['Review board in 15 minutes', '{title} will begin in 15 minutes{location}.'], ['Conseil de révision dans 15 minutes', '{title} commencera dans 15 minutes{location}.']],
  'activity.alternative_available': [['An alternative is available', '{title} has another available time to confirm.'], ['Une alternative est disponible', '{title} dispose d’un autre créneau à confirmer.']],
  'activity.reminder_7_days': [['Activity in 7 days', '{title} will take place in one week.'], ['Activité dans 7 jours', '{title} aura lieu dans une semaine.']],
  'activity.reminder_24_hours': [['Activity tomorrow', '{title} will take place in the next 24 hours.'], ['Activité demain', '{title} aura lieu dans les prochaines 24 heures.']],
  'delivery.dead_letter': [['Delivery requires attention', 'An alert exhausted its retries and requires administrative review.'], ['Envoi nécessitant une attention', 'Une alerte a épuisé ses tentatives et nécessite une vérification administrative.']],
  'department_operations.initiative': [['New department initiative', 'An initiative has been assigned to you in your department workspace.'], ['Nouvelle initiative départementale', 'Une initiative vous a été attribuée dans votre espace départemental.']],
  'department_operations.assignment': [['Department responsibility assigned', 'You have a new department responsibility.'], ['Responsabilité départementale attribuée', 'Vous avez une nouvelle responsabilité départementale.']],
  'department_operations.task': [['New department task', 'You have a new department task.'], ['Nouvelle tâche départementale', 'Vous avez une nouvelle tâche départementale.']],
  'department_operations.meeting': [['Department meeting scheduled', 'You have a new department meeting.'], ['Réunion départementale planifiée', 'Vous avez une nouvelle réunion départementale.']],
  'department_operations.mention': [['Mention in a department workspace', 'A member mentioned you in a comment.'], ['Mention dans un espace départemental', 'Un membre vous a mentionné dans un commentaire.']],
  'auth.password_reset_requested': [['Reset password', 'We received a request to reset your password. The link expires in 30 minutes.{resetUrl}'], ['Réinitialiser le mot de passe', 'Nous avons reçu une demande de réinitialisation de votre mot de passe. Le lien expire dans 30 minutes.{resetUrl}']],
};
const codes: Record<string, readonly [string, string, string]> = {
  APPROVE: ['aprobación', 'approved', 'approuvé'], REJECT: ['rechazo', 'rejected', 'rejeté'], REQUEST_CHANGES: ['cambios solicitados', 'changes requested', 'modifications demandées'], POSTPONE: ['pospuesta', 'postponed', 'reporté'],
  WARNING: ['leve', 'minor', 'mineur'], HIGH: ['alto', 'high', 'élevé'], CRITICAL: ['crítico', 'critical', 'critique'],
};
export function notificationPayload(payload: Record<string, unknown>, locale: NotificationLocale, timezone: string): Record<string, unknown> {
  const result = { ...payload }, index = locale === 'es' ? 0 : locale === 'en' ? 1 : 2;
  for (const key of ['decision', 'severity']) {
    const value = result[key];
    if (typeof value === 'string' && codes[value]) result[key] = codes[value]![index];
  }
  if (typeof result.when === 'string' && /^\d{4}-\d\d-\d\dT/.test(result.when) && Number.isFinite(Date.parse(result.when))) {
    result.when = new Intl.DateTimeFormat(({ es: 'es-BO', en: 'en-US', fr: 'fr-FR' } as const)[locale], { dateStyle: 'full', timeStyle: 'short', timeZone: timezone }).format(new Date(result.when));
  }
  return result;
}
export function localizedNotification(eventType: string, payload: Record<string, unknown>, locale: 'en' | 'fr'): { title: string; body: string } {
  const index = locale === 'en' ? 0 : 1;
  const [title, body] = translations[eventType]?.[index] ?? (locale === 'en' ? ['GestionChurch update', 'There is an update in the calendar.'] : ['Mise à jour de GestionChurch', 'Une mise à jour est disponible dans le calendrier.']);
  const values: Record<string, unknown> = {
    ...payload, title: payload.title ?? (locale === 'en' ? 'The activity' : 'L’activité'),
    when: payload.when ?? (locale === 'en' ? 'scheduled date' : 'date prévue'),
    decision: payload.decision ?? (locale === 'en' ? 'decision recorded' : 'décision enregistrée'),
    participant: payload.participant ?? (locale === 'en' ? 'A participant' : 'Un participant'),
    response: payload.response === 'CONFIRMED' ? (locale === 'en' ? 'confirmed attendance at' : 'a confirmé sa participation à') : (locale === 'en' ? 'declined attendance at' : 'a décliné sa participation à'),
    location: payload.location ? ` · ${payload.location}` : '', severity: payload.severity ?? '',
    resetUrl: typeof payload.resetUrl === 'string' ? ` ${payload.resetUrl}` : '',
  };
  return { title, body: eventType.startsWith('department_operations.') && typeof payload.body === 'string' ? payload.body : body.replace(/\{([a-zA-Z]+)\}/g, (_, key: string) => String(values[key] ?? '')).trim() };
}

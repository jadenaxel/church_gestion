/** Explicit central assignments; tenant administration is not an operational nomination role. */
export const nominationsRoleOptions = [
  { value: 'NOMINATIONS_COMMISSION_MEMBER', label: 'Miembro de comisión de Nombramientos', description: 'Participa en la comisión de Nombramientos mediante una asignación explícita.' },
  { value: 'NOMINATIONS_BALLOT_CUSTODIAN', label: 'Custodio de escrutinio de Nombramientos', description: 'Custodia el escrutinio de Nombramientos mediante una asignación explícita.' }
] as const;

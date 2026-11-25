const prisma = require('../config/prisma');

/**
 * Records an immutable audit trail entry for critical platform/merchant actions
 */
const recordAuditLog = async (
  { actorId = null, action, entity, entityId = null, details = null, req = null },
  tx = prisma
) => {
  try {
    const ipAddress = req
      ? req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null
      : null;

    return await tx.auditLog.create({
      data: {
        actorId,
        action,
        entity,
        entityId,
        details,
        ipAddress: typeof ipAddress === 'string' ? ipAddress : null,
      },
    });
  } catch (err) {
    console.error('AuditLog error (non-fatal):', err.message);
    return null;
  }
};

module.exports = { recordAuditLog };

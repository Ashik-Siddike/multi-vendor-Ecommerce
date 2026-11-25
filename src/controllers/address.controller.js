const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/response');

const VALID_ZONES = ['INSIDE_CITY', 'OUTSIDE_CITY'];

/**
 * Get all saved addresses for logged-in customer
 * GET /api/v1/addresses
 */
const getAddresses = async (req, res) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: req.user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return sendSuccess(res, 200, 'Addresses retrieved successfully', { addresses });
  } catch (error) {
    console.error('Error fetching addresses:', error);
    return sendError(res, 500, 'Failed to fetch addresses');
  }
};

/**
 * Create a new shipping address
 * POST /api/v1/addresses
 */
const createAddress = async (req, res) => {
  try {
    const { label = 'Home', fullName, phone, street, city, zone = 'INSIDE_CITY', isDefault = false } = req.body;

    if (!fullName || !phone || !street || !city) {
      return sendError(res, 400, 'fullName, phone, street, and city are required');
    }

    const normalizedZone = zone.toUpperCase();
    if (!VALID_ZONES.includes(normalizedZone)) {
      return sendError(res, 400, `Invalid zone. Allowed: ${VALID_ZONES.join(', ')}`);
    }

    const address = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.address.updateMany({
          where: { userId: req.user.id },
          data: { isDefault: false },
        });
      }

      return await tx.address.create({
        data: {
          userId: req.user.id,
          label: label.trim(),
          fullName: fullName.trim(),
          phone: phone.trim(),
          street: street.trim(),
          city: city.trim(),
          zone: normalizedZone,
          isDefault: Boolean(isDefault),
        },
      });
    });

    return sendSuccess(res, 201, 'Address created successfully', { address });
  } catch (error) {
    console.error('Error creating address:', error);
    return sendError(res, 500, 'Failed to create address');
  }
};

/**
 * Update an existing address
 * PATCH /api/v1/addresses/:id
 */
const updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { label, fullName, phone, street, city, zone, isDefault } = req.body;

    const existing = await prisma.address.findUnique({ where: { id } });
    if (!existing) {
      return sendError(res, 404, 'Address not found');
    }
    if (existing.userId !== req.user.id) {
      return sendError(res, 403, 'Forbidden: You can only update your own address');
    }

    let normalizedZone = existing.zone;
    if (zone) {
      normalizedZone = zone.toUpperCase();
      if (!VALID_ZONES.includes(normalizedZone)) {
        return sendError(res, 400, `Invalid zone. Allowed: ${VALID_ZONES.join(', ')}`);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (isDefault === true) {
        await tx.address.updateMany({
          where: { userId: req.user.id },
          data: { isDefault: false },
        });
      }

      return await tx.address.update({
        where: { id },
        data: {
          label: label ? label.trim() : existing.label,
          fullName: fullName ? fullName.trim() : existing.fullName,
          phone: phone ? phone.trim() : existing.phone,
          street: street ? street.trim() : existing.street,
          city: city ? city.trim() : existing.city,
          zone: normalizedZone,
          isDefault: isDefault !== undefined ? Boolean(isDefault) : existing.isDefault,
        },
      });
    });

    return sendSuccess(res, 200, 'Address updated successfully', { address: updated });
  } catch (error) {
    console.error('Error updating address:', error);
    return sendError(res, 500, 'Failed to update address');
  }
};

/**
 * Delete a saved address
 * DELETE /api/v1/addresses/:id
 */
const deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.address.findUnique({ where: { id } });
    if (!existing) {
      return sendError(res, 404, 'Address not found');
    }
    if (existing.userId !== req.user.id) {
      return sendError(res, 403, 'Forbidden: You can only delete your own address');
    }

    await prisma.address.delete({ where: { id } });
    return sendSuccess(res, 200, 'Address deleted successfully');
  } catch (error) {
    console.error('Error deleting address:', error);
    return sendError(res, 500, 'Failed to delete address');
  }
};

module.exports = {
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
};

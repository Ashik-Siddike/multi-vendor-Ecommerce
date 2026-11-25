const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/response');
const { createNotification } = require('../utils/notify');

const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
const COLOR_KEYS = [
  'primaryColor',
  'secondaryColor',
  'accentColor',
  'backgroundColor',
  'surfaceColor',
  'textColor',
];

/**
 * List all active storefront theme templates (Public)
 * GET /api/v1/themes
 */
const getAllThemes = async (req, res) => {
  try {
    const themes = await prisma.themeTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ isPremium: 'asc' }, { name: 'asc' }],
    });
    return sendSuccess(res, 200, 'Themes retrieved successfully', { themes });
  } catch (error) {
    console.error('Error fetching themes:', error);
    return sendError(res, 500, 'Failed to fetch themes');
  }
};

/**
 * Admin: Create a new frontend theme template
 * POST /api/v1/themes (Admin only)
 */
const createTheme = async (req, res) => {
  try {
    const { slug, name, description, previewImage, defaultConfig, isPremium = false } = req.body;

    if (!slug || !name || !defaultConfig) {
      return sendError(res, 400, 'slug, name, and defaultConfig are required');
    }

    const normalizedSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const existing = await prisma.themeTemplate.findUnique({ where: { slug: normalizedSlug } });
    if (existing) {
      return sendError(res, 409, `Theme with slug "${normalizedSlug}" already exists`);
    }

    const theme = await prisma.themeTemplate.create({
      data: {
        slug: normalizedSlug,
        name: name.trim(),
        description: description ? description.trim() : null,
        previewImage: previewImage || null,
        defaultConfig,
        isPremium: Boolean(isPremium),
      },
    });

    return sendSuccess(res, 201, 'Theme template created successfully', { theme });
  } catch (error) {
    console.error('Error creating theme:', error);
    return sendError(res, 500, 'Failed to create theme template');
  }
};

/**
 * List all SaaS subscription plans (Public)
 * GET /api/v1/plans
 */
const getAllPlans = async (req, res) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: { monthlyPrice: 'asc' },
    });
    return sendSuccess(res, 200, 'Subscription plans retrieved successfully', { plans });
  } catch (error) {
    console.error('Error fetching plans:', error);
    return sendError(res, 500, 'Failed to fetch subscription plans');
  }
};

/**
 * Vendor: Select storefront theme, customize colors/branding, and set slug/domain
 * PATCH /api/v1/vendor/theme (Vendor only)
 */
const updateVendorTheme = async (req, res) => {
  try {
    const { themeId, themeSlug, themeConfig, slug, customDomain } = req.body;

    const shop = await prisma.shop.findUnique({
      where: { ownerId: req.user.id },
      include: { plan: true, theme: true },
    });

    if (!shop) {
      return sendError(res, 404, 'Shop not found for this vendor');
    }

    const updateData = {};

    // 1. Handle Theme Template Selection
    if (themeId || themeSlug) {
      const targetTheme = await prisma.themeTemplate.findFirst({
        where: {
          ...(themeId ? { id: themeId } : { slug: themeSlug.trim().toLowerCase() }),
          isActive: true,
        },
      });

      if (!targetTheme) {
        return sendError(res, 404, 'Selected theme template not found');
      }

      if (targetTheme.isPremium && (!shop.plan || !shop.plan.allowPremiumThemes)) {
        return sendError(
          res,
          403,
          `Theme "${targetTheme.name}" is a Premium theme. Please upgrade to PRO or ENTERPRISE plan.`
        );
      }

      updateData.themeId = targetTheme.id;
    }

    // 2. Handle Custom Color & Branding Overrides
    if (themeConfig !== undefined) {
      if (typeof themeConfig !== 'object' || Array.isArray(themeConfig) || themeConfig === null) {
        return sendError(res, 400, 'themeConfig must be a valid JSON object');
      }

      for (const key of COLOR_KEYS) {
        if (themeConfig[key] !== undefined) {
          if (typeof themeConfig[key] !== 'string' || !HEX_COLOR_REGEX.test(themeConfig[key].trim())) {
            return sendError(
              res,
              400,
              `Invalid hex color for "${key}". Expected format like #FF5733 or #FFF.`
            );
          }
          themeConfig[key] = themeConfig[key].trim();
        }
      }

      const existingConfig =
        shop.themeConfig && typeof shop.themeConfig === 'object' ? shop.themeConfig : {};
      updateData.themeConfig = {
        ...existingConfig,
        ...themeConfig,
      };
    }

    // 3. Handle Storefront Slug update
    if (slug !== undefined) {
      const normalizedSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
      if (!normalizedSlug) {
        return sendError(res, 400, 'Invalid storefront slug');
      }
      const slugConflict = await prisma.shop.findFirst({
        where: { slug: normalizedSlug, id: { not: shop.id } },
      });
      if (slugConflict) {
        return sendError(res, 409, `Storefront slug "${normalizedSlug}" is already taken`);
      }
      updateData.slug = normalizedSlug;
    }

    // 4. Handle Custom Domain (Gated by Plan)
    if (customDomain !== undefined && customDomain !== null) {
      if (!shop.plan || !shop.plan.allowCustomDomain) {
        return sendError(
          res,
          403,
          'Custom domain mapping requires a PRO or ENTERPRISE subscription plan.'
        );
      }
      const normalizedDomain = customDomain.trim().toLowerCase();
      const domainConflict = await prisma.shop.findFirst({
        where: { customDomain: normalizedDomain, id: { not: shop.id } },
      });
      if (domainConflict) {
        return sendError(res, 409, `Custom domain "${normalizedDomain}" is already in use`);
      }
      updateData.customDomain = normalizedDomain;
    }

    const updatedShop = await prisma.shop.update({
      where: { id: shop.id },
      data: updateData,
      include: { theme: true, plan: true },
    });

    const baseDefaults = updatedShop.theme ? updatedShop.theme.defaultConfig : {};
    const customOverrides = updatedShop.themeConfig || {};

    return sendSuccess(res, 200, 'Storefront theme & customization updated successfully', {
      shopId: updatedShop.id,
      slug: updatedShop.slug,
      customDomain: updatedShop.customDomain,
      selectedTheme: updatedShop.theme
        ? { id: updatedShop.theme.id, slug: updatedShop.theme.slug, name: updatedShop.theme.name }
        : null,
      resolvedThemeConfig: {
        ...baseDefaults,
        ...customOverrides,
      },
    });
  } catch (error) {
    console.error('Error updating vendor theme:', error);
    return sendError(res, 500, 'Failed to update storefront theme');
  }
};

/**
 * Vendor: Upgrade / Change SaaS Subscription Plan
 * POST /api/v1/vendor/subscription/upgrade (Vendor only)
 */
const upgradeSubscription = async (req, res) => {
  try {
    const { planId, planName } = req.body;

    if (!planId && !planName) {
      return sendError(res, 400, 'Either planId or planName (e.g., PRO, ENTERPRISE) is required');
    }

    const plan = await prisma.subscriptionPlan.findFirst({
      where: planId ? { id: planId } : { name: planName.trim().toUpperCase() },
    });

    if (!plan) {
      return sendError(res, 404, 'Subscription plan not found');
    }

    const shop = await prisma.shop.findUnique({ where: { ownerId: req.user.id } });
    if (!shop) {
      return sendError(res, 404, 'Shop not found');
    }

    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);

    const updatedShop = await prisma.shop.update({
      where: { id: shop.id },
      data: {
        planId: plan.id,
        commissionRate: plan.commissionRate,
        subscriptionStatus: 'ACTIVE',
        subscriptionEndsAt: nextMonth,
      },
      include: { plan: true },
    });

    await createNotification({
      userId: req.user.id,
      title: `Upgraded to ${plan.name} Plan`,
      message: `Your shop is now on the ${plan.name} plan (Commission rate: ${plan.commissionRate}%).`,
      type: 'SYSTEM',
    });

    return sendSuccess(res, 200, `Successfully subscribed to ${plan.name} plan`, {
      shopId: updatedShop.id,
      plan: updatedShop.plan,
      commissionRate: updatedShop.commissionRate,
      subscriptionStatus: updatedShop.subscriptionStatus,
      subscriptionEndsAt: updatedShop.subscriptionEndsAt,
    });
  } catch (error) {
    console.error('Error upgrading subscription:', error);
    return sendError(res, 500, 'Failed to upgrade subscription plan');
  }
};

/**
 * Public Multi-Tenant Storefront Resolver
 * GET /api/v1/storefront/:slug
 */
const getStorefrontBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const shop = await prisma.shop.findFirst({
      where: {
        OR: [{ slug: slug.toLowerCase() }, { customDomain: slug.toLowerCase() }],
        isApproved: true,
      },
      include: {
        theme: true,
        products: {
          take: 12,
          orderBy: { createdAt: 'desc' },
          include: {
            category: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!shop) {
      return sendError(res, 404, 'Storefront not found or not approved');
    }

    const defaultFallback = {
      primaryColor: '#111827',
      secondaryColor: '#4B5563',
      accentColor: '#2563EB',
      backgroundColor: '#FFFFFF',
      surfaceColor: '#F9FAFB',
      textColor: '#111827',
      fontFamily: 'Inter, sans-serif',
      borderRadius: '8px',
      headerStyle: 'clean-centered',
    };

    const baseConfig = shop.theme ? shop.theme.defaultConfig : defaultFallback;
    const customConfig = shop.themeConfig && typeof shop.themeConfig === 'object' ? shop.themeConfig : {};

    return sendSuccess(res, 200, 'Storefront retrieved successfully', {
      storefront: {
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
        description: shop.description,
        logo: shop.logo,
        themeSlug: shop.theme ? shop.theme.slug : 'minimal-light',
        themeName: shop.theme ? shop.theme.name : 'Minimal Light',
        designConfig: {
          ...baseConfig,
          ...customConfig,
        },
        featuredProducts: shop.products,
      },
    });
  } catch (error) {
    console.error('Error fetching storefront:', error);
    return sendError(res, 500, 'Failed to load storefront');
  }
};

module.exports = {
  getAllThemes,
  createTheme,
  getAllPlans,
  updateVendorTheme,
  upgradeSubscription,
  getStorefrontBySlug,
};

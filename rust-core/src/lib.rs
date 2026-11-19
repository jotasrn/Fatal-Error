#![no_std]

#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}

/// Fast 3D slab raycast against an AABB [min_x, min_y, min_z, max_x, max_y, max_z].
/// Returns the hit distance `t >= 0.0` if hit within `max_t`, or `-1.0` on miss.
#[no_mangle]
pub extern "C" fn slab_raycast_aabb(
    ox: f32, oy: f32, oz: f32,
    dx: f32, dy: f32, dz: f32,
    min_x: f32, min_y: f32, min_z: f32,
    max_x: f32, max_y: f32, max_z: f32,
    max_t: f32,
) -> f32 {
    let mut tmin = 0.0_f32;
    let mut tmax = max_t;

    // X slab
    if dx.abs() < 1e-9 {
        if ox < min_x || ox > max_x {
            return -1.0;
        }
    } else {
        let inv = 1.0 / dx;
        let mut t1 = (min_x - ox) * inv;
        let mut t2 = (max_x - ox) * inv;
        if t1 > t2 {
            let tmp = t1;
            t1 = t2;
            t2 = tmp;
        }
        if t1 > tmin {
            tmin = t1;
        }
        if t2 < tmax {
            tmax = t2;
        }
        if tmin > tmax {
            return -1.0;
        }
    }

    // Y slab
    if dy.abs() < 1e-9 {
        if oy < min_y || oy > max_y {
            return -1.0;
        }
    } else {
        let inv = 1.0 / dy;
        let mut t1 = (min_y - oy) * inv;
        let mut t2 = (max_y - oy) * inv;
        if t1 > t2 {
            let tmp = t1;
            t1 = t2;
            t2 = tmp;
        }
        if t1 > tmin {
            tmin = t1;
        }
        if t2 < tmax {
            tmax = t2;
        }
        if tmin > tmax {
            return -1.0;
        }
    }

    // Z slab
    if dz.abs() < 1e-9 {
        if oz < min_z || oz > max_z {
            return -1.0;
        }
    } else {
        let inv = 1.0 / dz;
        let mut t1 = (min_z - oz) * inv;
        let mut t2 = (max_z - oz) * inv;
        if t1 > t2 {
            let tmp = t1;
            t1 = t2;
            t2 = tmp;
        }
        if t1 > tmin {
            tmin = t1;
        }
        if t2 < tmax {
            tmax = t2;
        }
        if tmin > tmax {
            return -1.0;
        }
    }

    tmin
}

/// Fast AABB overlap check in flat coordinates.
#[no_mangle]
pub extern "C" fn aabb_overlaps(
    ax0: f32, ay0: f32, az0: f32, ax1: f32, ay1: f32, az1: f32,
    bx0: f32, by0: f32, bz0: f32, bx1: f32, by1: f32, bz1: f32,
) -> i32 {
    if ax0 < bx1 && ax1 > bx0 && ay0 < by1 && ay1 > by0 && az0 < bz1 && az1 > bz0 {
        1
    } else {
        0
    }
}


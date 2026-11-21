/*
 * Refraction shader from Kyant0/backdrop v2.0.0 (io.github.kyant0:backdrop),
 * https://github.com/Kyant0/backdrop, as vendored by BitChord and Jarvoice.
 * Copyright 2025 Kyant0, Apache License 2.0. Adjusted to use lens-relative coordinates for its corner radii
 * and optimized to 3-tap optical RGB centroid dispersion for 120Hz mobile GPU performance.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package expo.modules.t3liquidglass

/** Rounded-rect lens with depth and chromatic dispersion (AGSL, API 33+). */
internal object GlassShaders {
  const val REFRACTION: String = """
uniform shader content;

uniform float2 size;
uniform float2 offset;
uniform float4 cornerRadii;
uniform float refractionHeight;
uniform float refractionAmount;
uniform float depthEffect;
uniform float chromaticAberration;

float radiusAt(float2 coord, float4 radii) {
    if (coord.x >= 0.0) {
        return coord.y <= 0.0 ? radii.y : radii.z;
    }
    return coord.y <= 0.0 ? radii.x : radii.w;
}

float sdRoundedRect(float2 coord, float2 halfSize, float radius) {
    float2 cornerCoord = abs(coord) - (halfSize - float2(radius));
    float outside = length(max(cornerCoord, 0.0)) - radius;
    float inside = min(max(cornerCoord.x, cornerCoord.y), 0.0);
    return outside + inside;
}

float2 gradSdRoundedRect(float2 coord, float2 halfSize, float radius) {
    float2 cornerCoord = abs(coord) - (halfSize - float2(radius));
    if (cornerCoord.x >= 0.0 || cornerCoord.y >= 0.0) {
        return sign(coord) * normalize(max(cornerCoord, 0.0));
    }
    float gradX = step(cornerCoord.y, cornerCoord.x);
    return sign(coord) * float2(gradX, 1.0 - gradX);
}

float circleMap(float x) {
    return 1.0 - sqrt(max(0.0, 1.0 - x * x));
}

half4 main(float2 coord) {
    float2 halfSize = size * 0.5;
    float2 centeredCoord = (coord + offset) - halfSize;
    float radius = radiusAt(centeredCoord, cornerRadii);

    float sd = sdRoundedRect(centeredCoord, halfSize, radius);
    if (-sd >= refractionHeight) {
        return content.eval(coord);
    }
    sd = min(sd, 0.0);

    float d = circleMap(1.0 - -sd / refractionHeight) * refractionAmount;
    float gradRadius = min(radius * 1.5, min(halfSize.x, halfSize.y));
    float2 centerDir = dot(centeredCoord, centeredCoord) > 1e-4 ? normalize(centeredCoord) : float2(0.0);
    float2 grad = normalize(gradSdRoundedRect(centeredCoord, halfSize, gradRadius) + depthEffect * centerDir);

    float2 refractedCoord = coord + d * grad;
    float dispersionIntensity = chromaticAberration * ((centeredCoord.x * centeredCoord.y) / max(1.0, halfSize.x * halfSize.y));
    // 3-tap optical RGB centroid (+/- 0.667) matches the 7-tap spectral centroid at 2.33x lower GPU bandwidth.
    float2 dispersed = d * grad * (dispersionIntensity * 0.6667);
    if (dot(dispersed, dispersed) < 0.04) {
        return content.eval(refractedCoord);
    }

    half4 center = content.eval(refractedCoord);
    half r = content.eval(refractedCoord + dispersed).r;
    half b = content.eval(refractedCoord - dispersed).b;
    return half4(r, center.g, b, center.a);
}
"""
}

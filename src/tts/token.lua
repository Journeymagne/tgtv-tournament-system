-- KTUI handles attachment through the object's tags. This script only sizes
-- the token and draws marker ranges, measured in inches from the token edge.
local millimetres = __SIZE_MM__
local isMarker = __IS_MARKER__
local defaultRange = __RANGE_INCHES__
local calibrated = false
local measureRange = defaultRange
local measureColor = {0.5, 0.5, 0.5}

local function drawRange()
    if not isMarker then return end
    if measureRange <= 0 then self.setVectorLines({}); return end
    local scale = self.getScale()
    local bounds = self.getBoundsNormalized().size
    local radius = math.max(bounds.x, bounds.z) / 2 + measureRange
    local points = {}
    for i = 0, 64 do
        local angle = i * math.pi / 32
        table.insert(points, {x=math.cos(angle)*radius/scale.x,
            y=0.01/scale.y, z=math.sin(angle)*radius/scale.z})
    end
    self.setVectorLines({{points=points, color=measureColor, thickness=0.025/scale.x}})
end

local function setRange(playerColor, distance)
    measureRange = math.max(0, math.min(12, distance))
    if playerColor then
        local color = Color.fromString(playerColor)
        measureColor = {color.r, color.g, color.b}
    end
    drawRange()
end

function onNumberTyped(playerColor, number)
    if not isMarker then return false end
    setRange(playerColor, number)
    return true
end

function onDrop() drawRange() end

function onLoad(saved)
    if saved and saved ~= "" then
        local ok, state = pcall(JSON.decode, saved)
        if ok and type(state) == "table" then
            calibrated = state.calibrated == true
            if type(state.range) == "number" and state.range >= 0 and state.range <= 12 then measureRange = state.range end
            if type(state.color) == "table" and type(state.color[1]) == "number"
                and type(state.color[2]) == "number" and type(state.color[3]) == "number" then measureColor = state.color end
        end
    end
    if isMarker then
        self.max_typed_number = 12
        self.addContextMenuItem("Hide range (0)", function(playerColor) setRange(playerColor, 0) end)
        self.addContextMenuItem("Default range (" .. defaultRange .. " in)", function(playerColor) setRange(playerColor, defaultRange) end)
        for _, distance in ipairs({1, 2, 3, 4, 6, 9, 12}) do
            self.addContextMenuItem("Range: " .. distance .. " in", function(playerColor) setRange(playerColor, distance) end)
        end
    end
    Wait.condition(function()
        Wait.frames(function()
            if not calibrated then
                local size = self.getBoundsNormalized().size
                local diameter = math.max(size.x, size.z)
                if diameter <= 0 then return end
                local scale = self.getScale()
                local ratio = (millimetres / 25.4) / diameter
                self.setScale({scale.x * ratio, scale.y, scale.z * ratio})
                calibrated = true
            end
            Wait.frames(drawRange, 2)
        end, 2)
    end, function() return not self.loading_custom end, 30)
end

function onSave() return JSON.encode({calibrated=calibrated, range=measureRange, color=measureColor}) end
